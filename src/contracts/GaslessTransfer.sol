// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GaslessTransfer
 * @author Legion Transfer Team
 * @notice Enables fully gasless token transfers with flexible fee payment
 * 
 * ============================
 * HOW THIS SYSTEM WORKS
 * ============================
 * 
 * 1. USER FLOW:
 *    - User selects tokenToSend (USDC, USDT, or any ERC20)
 *    - User selects feeToken (USDC, USDT, or native ETH/Base_ETH)
 *    - User approves BOTH tokens to this contract (if not already approved)
 *    - That's it! User never needs ETH for gas.
 *
 * 2. BACKEND FLOW:
 *    - Backend wallet (has ETH for gas) calls gaslessTransfer()
 *    - Backend pays the network gas fees from its own ETH balance
 *    - Contract transfers tokenToSend from sender → receiver
 *    - Contract transfers feeToken from sender → backendWallet
 *
 * 3. FEE STRUCTURE:
 *    - Fixed fee: $0.40 USD per transfer
 *    - Fee is calculated off-chain based on current token prices
 *    - Example: If paying in USDC, fee = 400000 (0.40 USDC with 6 decimals)
 *    - Example: If paying in ETH at $3000/ETH, fee = 133333333333333 (0.000133 ETH)
 *
 * 4. SECURITY:
 *    - ONLY backendWallet can call gaslessTransfer()
 *    - ReentrancyGuard prevents reentrancy attacks
 *    - SafeERC20 handles non-standard ERC20 tokens
 *    - Both transfers must succeed or entire tx reverts (atomic)
 *
 * ============================
 * DEPLOYMENT INSTRUCTIONS
 * ============================
 * 
 * For Ethereum Mainnet:
 *   1. Deploy with your backend wallet address as constructor argument
 *   2. Verify on Etherscan
 *   3. Update edge function with deployed address
 *
 * For Base Mainnet:
 *   1. Deploy with same backend wallet address
 *   2. Verify on Basescan
 *   3. Update edge function with deployed address
 *
 * ============================
 * INTEGRATION EXAMPLE
 * ============================
 * 
 * Backend TypeScript call:
 * ```
 * const contract = new ethers.Contract(GASLESS_CONTRACT_ADDRESS, ABI, backendSigner);
 * await contract.gaslessTransfer(
 *   senderAddress,
 *   receiverAddress,
 *   USDC_ADDRESS,
 *   parseUnits("100", 6),  // 100 USDC
 *   USDT_ADDRESS,          // Pay fee in USDT
 *   parseUnits("0.40", 6)  // $0.40 fee
 * );
 * ```
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GaslessTransfer is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The backend wallet that can submit transactions and receives fees
    address public immutable backendWallet;
    
    /// @notice The fixed fee in USD cents (40 = $0.40)
    uint256 public constant FEE_USD_CENTS = 40;

    /// @notice Emitted when a gasless transfer is executed successfully
    event GaslessTransferExecuted(
        address indexed sender,
        address indexed receiver,
        address indexed tokenToSend,
        uint256 amount,
        address feeToken,
        uint256 feeAmount
    );

    /// @notice Emitted when fees are collected
    event FeeCollected(
        address indexed payer,
        address indexed feeToken,
        uint256 amount
    );

    /// @notice Error thrown when caller is not the backend wallet
    error OnlyBackendWallet();
    
    /// @notice Error thrown when zero address is provided
    error ZeroAddress();
    
    /// @notice Error thrown when amount is zero
    error ZeroAmount();

    /**
     * @notice Constructor sets the backend wallet address
     * @param _backendWallet The address that will submit transactions and receive fees
     * @dev This address cannot be changed after deployment
     */
    constructor(address _backendWallet) {
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
     * @dev This function performs TWO atomic transfers:
     *      1. tokenToSend: sender → receiver (the actual transfer)
     *      2. feeToken: sender → backendWallet (the fee payment)
     * 
     * REQUIREMENTS:
     * - Caller MUST be the backendWallet
     * - Sender MUST have approved this contract for tokenToSend (at least `amount`)
     * - Sender MUST have approved this contract for feeToken (at least `feeAmount`)
     * - Sender MUST have sufficient balance of both tokens
     * - Both transfers MUST succeed or the entire transaction reverts
     *
     * @param sender The address sending the tokens (must have approved this contract)
     * @param receiver The address receiving the tokens
     * @param tokenToSend The ERC20 token being transferred
     * @param amount The amount of tokens to transfer (in smallest units)
     * @param feeToken The ERC20 token used to pay the fee (can be same as tokenToSend)
     * @param feeAmount The fee amount in feeToken's smallest units (calculated off-chain for $0.40 USD)
     */
    function gaslessTransfer(
        address sender,
        address receiver,
        IERC20 tokenToSend,
        uint256 amount,
        IERC20 feeToken,
        uint256 feeAmount
    ) external onlyBackend nonReentrant {
        // === INPUT VALIDATION ===
        if (sender == address(0) || receiver == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        
        // === EXECUTE TRANSFERS (ATOMIC) ===
        
        // Transfer 1: Main transfer - sender → receiver
        // Uses SafeERC20 to handle non-standard tokens (like USDT on mainnet)
        tokenToSend.safeTransferFrom(sender, receiver, amount);

        // Transfer 2: Fee payment - sender → backendWallet
        // Only if there's a fee to collect (feeAmount > 0)
        if (feeAmount > 0) {
            feeToken.safeTransferFrom(sender, backendWallet, feeAmount);
            emit FeeCollected(sender, address(feeToken), feeAmount);
        }

        // === EMIT EVENT ===
        emit GaslessTransferExecuted(
            sender,
            receiver,
            address(tokenToSend),
            amount,
            address(feeToken),
            feeAmount
        );
    }

    /**
     * @notice Convenience function when fee token is the same as transfer token
     * @dev Saves gas by avoiding duplicate token address parameters
     *
     * @param sender The address sending the tokens
     * @param receiver The address receiving the tokens
     * @param token The ERC20 token for both transfer and fee payment
     * @param amount The amount of tokens to transfer
     * @param feeAmount The fee amount (in same token)
     */
    function gaslessTransferSameToken(
        address sender,
        address receiver,
        IERC20 token,
        uint256 amount,
        uint256 feeAmount
    ) external onlyBackend nonReentrant {
        if (sender == address(0) || receiver == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        
        // Transfer full amount to receiver first
        token.safeTransferFrom(sender, receiver, amount);
        
        // Then collect fee
        if (feeAmount > 0) {
            token.safeTransferFrom(sender, backendWallet, feeAmount);
            emit FeeCollected(sender, address(token), feeAmount);
        }

        emit GaslessTransferExecuted(
            sender,
            receiver,
            address(token),
            amount,
            address(token),
            feeAmount
        );
    }

    /**
     * @notice Check if a user has approved this contract for a specific token
     * @param token The ERC20 token to check
     * @param owner The address to check approval for
     * @return allowance The current approval amount
     */
    function checkApproval(
        IERC20 token,
        address owner
    ) external view returns (uint256 allowance) {
        return token.allowance(owner, address(this));
    }

    /**
     * @notice Get the required approval amount for a transfer
     * @dev Helper function for frontend to know how much approval is needed
     * @param tokenToSend Token being transferred
     * @param feeToken Token used for fee
     * @param amount Transfer amount
     * @param feeAmount Fee amount
     * @param sender User address
     * @return tokenToSendApprovalNeeded Amount still needed for transfer token
     * @return feeTokenApprovalNeeded Amount still needed for fee token
     */
    function getRequiredApprovals(
        IERC20 tokenToSend,
        IERC20 feeToken,
        uint256 amount,
        uint256 feeAmount,
        address sender
    ) external view returns (uint256 tokenToSendApprovalNeeded, uint256 feeTokenApprovalNeeded) {
        uint256 currentTransferAllowance = tokenToSend.allowance(sender, address(this));
        uint256 currentFeeAllowance = feeToken.allowance(sender, address(this));
        
        // If same token, need combined amount
        if (address(tokenToSend) == address(feeToken)) {
            uint256 totalNeeded = amount + feeAmount;
            if (currentTransferAllowance < totalNeeded) {
                tokenToSendApprovalNeeded = totalNeeded - currentTransferAllowance;
            }
            feeTokenApprovalNeeded = 0; // Already covered
        } else {
            if (currentTransferAllowance < amount) {
                tokenToSendApprovalNeeded = amount - currentTransferAllowance;
            }
            if (currentFeeAllowance < feeAmount) {
                feeTokenApprovalNeeded = feeAmount - currentFeeAllowance;
            }
        }
    }
}

/**
 * ============================
 * CONTRACT ABI (for ethers.js)
 * ============================
 * 
 * const GASLESS_TRANSFER_ABI = [
 *   "function gaslessTransfer(address sender, address receiver, address tokenToSend, uint256 amount, address feeToken, uint256 feeAmount) external",
 *   "function gaslessTransferSameToken(address sender, address receiver, address token, uint256 amount, uint256 feeAmount) external",
 *   "function checkApproval(address token, address owner) external view returns (uint256)",
 *   "function getRequiredApprovals(address tokenToSend, address feeToken, uint256 amount, uint256 feeAmount, address sender) external view returns (uint256, uint256)",
 *   "function backendWallet() external view returns (address)",
 *   "event GaslessTransferExecuted(address indexed sender, address indexed receiver, address indexed tokenToSend, uint256 amount, address feeToken, uint256 feeAmount)",
 *   "event FeeCollected(address indexed payer, address indexed feeToken, uint256 amount)"
 * ];
 * 
 * ============================
 * DEPLOYMENT SCRIPT (Foundry)
 * ============================
 * 
 * forge create --rpc-url $RPC_URL \
 *   --private-key $DEPLOYER_PRIVATE_KEY \
 *   --constructor-args $BACKEND_WALLET_ADDRESS \
 *   --verify \
 *   src/contracts/GaslessTransfer.sol:GaslessTransfer
 * 
 * ============================
 * AFTER DEPLOYMENT
 * ============================
 * 
 * 1. Note the deployed contract address
 * 2. Add to edge function as GASLESS_CONTRACT_ETH and GASLESS_CONTRACT_BASE
 * 3. Users approve the CONTRACT address (not backend wallet)
 * 4. Backend calls contract.gaslessTransfer() to execute transfers
 */
