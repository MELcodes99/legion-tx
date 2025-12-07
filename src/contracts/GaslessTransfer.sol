// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GaslessTransfer
 * @author Legion Transfer Team
 * @notice Enables fully gasless token transfers with flexible fee payment
 * @dev This contract allows users to transfer ERC20 tokens without holding any native tokens (ETH/Base ETH)
 * 
 * HOW IT WORKS:
 * 1. User approves this contract to spend their tokens (tokenToSend and feeToken)
 * 2. User signs an EIP-712 message authorizing the transfer off-chain
 * 3. Backend relayer (backendWallet) calls executeGaslessTransfer with the user's signature
 * 4. Contract verifies the signature and executes TWO atomic transfers:
 *    - transferFrom: sender -> receiver (the actual transfer amount)
 *    - transferFrom: sender -> backendWallet (the fee, fixed at $0.40 USD equivalent)
 * 5. Backend wallet pays the network gas fees from its own ETH balance
 * 
 * FEE STRUCTURE:
 * - Fixed fee of $0.40 USD per transfer
 * - Fee can be paid in USDC, USDT, or any ERC20 token (caller specifies the amount)
 * - The fee amount in tokens must be calculated off-chain based on current prices
 * - Example: If paying in USDC (1 USDC = $1), fee = 400000 (0.40 USDC with 6 decimals)
 * 
 * SECURITY FEATURES:
 * - ReentrancyGuard prevents reentrancy attacks
 * - EIP-712 signatures prevent replay attacks (each nonce can only be used once)
 * - Deadline prevents stale signatures from being used
 * - Only the backend wallet can submit transactions
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract GaslessTransfer is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    /// @notice The backend wallet that can submit transactions and receives fees
    address public immutable backendWallet;
    
    /// @notice Mapping of sender addresses to their nonces (for replay protection)
    mapping(address => uint256) public nonces;
    
    /// @notice The fixed fee in USD cents (40 = $0.40)
    uint256 public constant FEE_USD_CENTS = 40;

    /// @notice EIP-712 typehash for the GaslessTransfer struct
    bytes32 public constant GASLESS_TRANSFER_TYPEHASH = keccak256(
        "GaslessTransfer(address sender,address receiver,address tokenToSend,uint256 amount,address feeToken,uint256 feeAmount,uint256 nonce,uint256 deadline)"
    );

    /// @notice Emitted when a gasless transfer is executed
    event GaslessTransferExecuted(
        address indexed sender,
        address indexed receiver,
        address indexed tokenToSend,
        uint256 amount,
        address feeToken,
        uint256 feeAmount,
        uint256 nonce
    );

    /// @notice Emitted when fees are collected
    event FeeCollected(
        address indexed payer,
        address indexed feeToken,
        uint256 amount
    );

    /// @notice Error thrown when caller is not the backend wallet
    error OnlyBackendWallet();
    
    /// @notice Error thrown when signature is invalid
    error InvalidSignature();
    
    /// @notice Error thrown when signature deadline has passed
    error SignatureExpired();
    
    /// @notice Error thrown when nonce is invalid
    error InvalidNonce();
    
    /// @notice Error thrown when zero address is provided
    error ZeroAddress();
    
    /// @notice Error thrown when amount is zero
    error ZeroAmount();

    /**
     * @notice Constructor sets the backend wallet address
     * @param _backendWallet The address that will submit transactions and receive fees
     */
    constructor(address _backendWallet) EIP712("Legion Transfer", "1") {
        if (_backendWallet == address(0)) revert ZeroAddress();
        backendWallet = _backendWallet;
    }

    /**
     * @notice Modifier to restrict function access to the backend wallet only
     */
    modifier onlyBackend() {
        if (msg.sender != backendWallet) revert OnlyBackendWallet();
        _;
    }

    /**
     * @notice Execute a gasless token transfer with fee payment
     * @dev This function is called by the backend wallet after verifying the user's signature
     * 
     * @param sender The address sending the tokens (must have approved this contract)
     * @param receiver The address receiving the tokens
     * @param tokenToSend The ERC20 token being transferred
     * @param amount The amount of tokens to transfer (in smallest units)
     * @param feeToken The ERC20 token used to pay the fee
     * @param feeAmount The fee amount in feeToken's smallest units (calculated off-chain for $0.40 USD)
     * @param deadline The timestamp after which the signature is no longer valid
     * @param signature The EIP-712 signature from the sender authorizing this transfer
     * 
     * @custom:requirements
     * - Caller must be the backendWallet
     * - Current timestamp must be <= deadline
     * - Signature must be valid and from the sender
     * - Sender must have approved this contract for tokenToSend (at least `amount`)
     * - Sender must have approved this contract for feeToken (at least `feeAmount`)
     * - Sender must have sufficient balance of both tokens
     */
    function executeGaslessTransfer(
        address sender,
        address receiver,
        IERC20 tokenToSend,
        uint256 amount,
        IERC20 feeToken,
        uint256 feeAmount,
        uint256 deadline,
        bytes calldata signature
    ) external onlyBackend nonReentrant {
        // Validate inputs
        if (sender == address(0) || receiver == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Get current nonce for the sender
        uint256 currentNonce = nonces[sender];

        // Build the struct hash for signature verification
        bytes32 structHash = keccak256(abi.encode(
            GASLESS_TRANSFER_TYPEHASH,
            sender,
            receiver,
            address(tokenToSend),
            amount,
            address(feeToken),
            feeAmount,
            currentNonce,
            deadline
        ));

        // Recover the signer from the signature
        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, signature);

        // Verify the signature is from the sender
        if (recoveredSigner != sender) revert InvalidSignature();

        // Increment the nonce to prevent replay attacks
        nonces[sender] = currentNonce + 1;

        // Execute the main transfer: sender -> receiver
        tokenToSend.safeTransferFrom(sender, receiver, amount);

        // Execute the fee transfer: sender -> backendWallet
        if (feeAmount > 0) {
            feeToken.safeTransferFrom(sender, backendWallet, feeAmount);
            emit FeeCollected(sender, address(feeToken), feeAmount);
        }

        emit GaslessTransferExecuted(
            sender,
            receiver,
            address(tokenToSend),
            amount,
            address(feeToken),
            feeAmount,
            currentNonce
        );
    }

    /**
     * @notice Execute a simple transfer (same token for transfer and fee)
     * @dev Convenience function when the fee token is the same as the transfer token
     * 
     * @param sender The address sending the tokens
     * @param receiver The address receiving the tokens
     * @param token The ERC20 token being transferred and used for fees
     * @param amount The amount of tokens to transfer
     * @param feeAmount The fee amount in the same token
     * @param deadline The signature expiration timestamp
     * @param signature The EIP-712 signature from the sender
     */
    function executeSimpleTransfer(
        address sender,
        address receiver,
        IERC20 token,
        uint256 amount,
        uint256 feeAmount,
        uint256 deadline,
        bytes calldata signature
    ) external onlyBackend nonReentrant {
        executeGaslessTransfer(sender, receiver, token, amount, token, feeAmount, deadline, signature);
    }

    /**
     * @notice Get the current nonce for an address
     * @param account The address to check
     * @return The current nonce
     */
    function getNonce(address account) external view returns (uint256) {
        return nonces[account];
    }

    /**
     * @notice Get the domain separator for EIP-712 signatures
     * @return The domain separator bytes32 value
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Calculate the digest that needs to be signed for a gasless transfer
     * @dev This can be called off-chain to construct the message for signing
     * 
     * @param sender The sender address
     * @param receiver The receiver address
     * @param tokenToSend The transfer token address
     * @param amount The transfer amount
     * @param feeToken The fee token address
     * @param feeAmount The fee amount
     * @param deadline The signature deadline
     * @return The EIP-712 digest to be signed
     */
    function getTransferDigest(
        address sender,
        address receiver,
        address tokenToSend,
        uint256 amount,
        address feeToken,
        uint256 feeAmount,
        uint256 deadline
    ) external view returns (bytes32) {
        uint256 currentNonce = nonces[sender];
        
        bytes32 structHash = keccak256(abi.encode(
            GASLESS_TRANSFER_TYPEHASH,
            sender,
            receiver,
            tokenToSend,
            amount,
            feeToken,
            feeAmount,
            currentNonce,
            deadline
        ));

        return _hashTypedDataV4(structHash);
    }
}

/**
 * DEPLOYMENT INSTRUCTIONS:
 * 
 * 1. Deploy this contract with your backend wallet address as constructor argument
 * 2. The backend wallet address cannot be changed after deployment
 * 
 * For Ethereum Mainnet:
 * - Deploy using Remix, Hardhat, or Foundry
 * - Verify the contract on Etherscan
 * - Note the deployed contract address
 * 
 * For Base Mainnet:
 * - Same process, deploy to Base
 * - Verify on Basescan
 * 
 * INTEGRATION:
 * 
 * After deployment, update the edge function with:
 * 1. Contract addresses for each chain
 * 2. Update executeGaslessTransfer to call the contract instead of direct transferFrom
 * 3. The contract handles atomic execution and replay protection
 * 
 * USER FLOW:
 * 1. User approves contract address (not backend wallet) to spend tokens
 * 2. User signs EIP-712 message with transfer details
 * 3. Backend calls contract.executeGaslessTransfer() with signature
 * 4. Contract executes both transfers atomically
 * 
 * BENEFITS OF CONTRACT APPROACH:
 * - True atomic execution (both transfers in one tx)
 * - On-chain replay protection via nonces
 * - Gas optimization through batched calls
 * - Transparent fee handling on-chain
 */
