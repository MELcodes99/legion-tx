 import { useState, useEffect, useRef } from 'react';
 import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
 import { Button } from '@/components/ui/button';
 import { AlertCircle, Camera, X, Check, Shield } from 'lucide-react';
 import { Alert, AlertDescription } from '@/components/ui/alert';
 
 interface QRScannerProps {
   open: boolean;
   onClose: () => void;
   onScan: (address: string) => void;
   chain: 'solana' | 'sui' | 'base' | 'ethereum' | null;
 }
 
 // Address validation functions for each chain
 const validateSolanaAddress = (address: string): boolean => {
   // Solana addresses are base58 encoded, 32-44 characters
   const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
   return base58Regex.test(address);
 };
 
 const validateSuiAddress = (address: string): boolean => {
   // Sui addresses start with 0x and are 66 characters (0x + 64 hex chars)
   const suiRegex = /^0x[a-fA-F0-9]{64}$/;
   return suiRegex.test(address);
 };
 
 const validateEVMAddress = (address: string): boolean => {
   // EVM addresses start with 0x and are 42 characters (0x + 40 hex chars)
   const evmRegex = /^0x[a-fA-F0-9]{40}$/;
   return evmRegex.test(address);
 };
 
 const validateAddress = (address: string, chain: string | null): { valid: boolean; message: string } => {
   if (!address || !chain) {
     return { valid: false, message: 'No address or chain detected' };
   }
 
   const trimmedAddress = address.trim();
 
   switch (chain) {
     case 'solana':
       if (validateSolanaAddress(trimmedAddress)) {
         return { valid: true, message: 'Valid Solana address detected' };
       }
       return { valid: false, message: 'Invalid Solana address format' };
     
     case 'sui':
       if (validateSuiAddress(trimmedAddress)) {
         return { valid: true, message: 'Valid Sui address detected' };
       }
       return { valid: false, message: 'Invalid Sui address format. Must be 0x followed by 64 hex characters' };
     
     case 'base':
     case 'ethereum':
       if (validateEVMAddress(trimmedAddress)) {
         return { valid: true, message: `Valid ${chain === 'base' ? 'Base' : 'Ethereum'} address detected` };
       }
       return { valid: false, message: 'Invalid EVM address format. Must be 0x followed by 40 hex characters' };
     
     default:
       return { valid: false, message: 'Unknown chain type' };
   }
 };
 
 // Extract wallet address from various QR formats
 const extractAddress = (scannedData: string): string => {
   const trimmed = scannedData.trim();
   
   // Handle common wallet QR formats
   // Format: "solana:ADDRESS" or "ethereum:ADDRESS" etc.
   if (trimmed.includes(':')) {
     const parts = trimmed.split(':');
     const lastPart = parts[parts.length - 1];
     // Remove any query params (e.g., ?amount=100)
     return lastPart.split('?')[0].trim();
   }
   
   // Handle EIP-681 format: ethereum:0x...@chainId/...
   if (trimmed.startsWith('ethereum:') || trimmed.startsWith('solana:')) {
     const address = trimmed.replace(/^(ethereum|solana):/, '').split('@')[0].split('?')[0];
     return address.trim();
   }
   
   // Plain address
   return trimmed;
 };
 
 export const QRScanner = ({ open, onClose, onScan, chain }: QRScannerProps) => {
   const [error, setError] = useState<string | null>(null);
   const [scannedAddress, setScannedAddress] = useState<string | null>(null);
   const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null);
   const [isScanning, setIsScanning] = useState(false);
   const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
   const scannerRef = useRef<Html5Qrcode | null>(null);
   const containerRef = useRef<HTMLDivElement>(null);
 
   const startScanner = async () => {
     if (!containerRef.current) return;
     
     try {
       setError(null);
       setIsScanning(true);
       setCameraPermission('pending');
       
       const html5QrCode = new Html5Qrcode('qr-reader');
       scannerRef.current = html5QrCode;
 
       await html5QrCode.start(
         { facingMode: 'environment' },
         {
           fps: 10,
           qrbox: { width: 250, height: 250 },
           aspectRatio: 1,
         },
         (decodedText) => {
           // Successfully scanned
           const address = extractAddress(decodedText);
           const validation = validateAddress(address, chain);
           
           setScannedAddress(address);
           setValidationResult(validation);
           
           // Stop scanning after successful scan
           html5QrCode.stop().catch(console.error);
           setIsScanning(false);
         },
         (errorMessage) => {
           // Scan error (this fires continuously while scanning, ignore it)
         }
       );
       
       setCameraPermission('granted');
     } catch (err: any) {
       console.error('QR Scanner error:', err);
       setIsScanning(false);
       
       if (err.message?.includes('Permission') || err.name === 'NotAllowedError') {
         setCameraPermission('denied');
         setError('Camera permission denied. Please allow camera access to scan QR codes.');
       } else if (err.message?.includes('NotFoundError') || err.name === 'NotFoundError') {
         setError('No camera found. Please ensure your device has a camera.');
       } else {
         setError('Failed to start camera. Please try again.');
       }
     }
   };
 
   const stopScanner = async () => {
     if (scannerRef.current) {
       try {
         await scannerRef.current.stop();
       } catch (err) {
         console.error('Error stopping scanner:', err);
       }
       scannerRef.current = null;
     }
     setIsScanning(false);
   };
 
   useEffect(() => {
     if (open) {
       // Small delay to ensure DOM is ready
       const timer = setTimeout(() => {
         startScanner();
       }, 100);
       return () => clearTimeout(timer);
     } else {
       stopScanner();
       setScannedAddress(null);
       setValidationResult(null);
       setError(null);
     }
   }, [open]);
 
   useEffect(() => {
     return () => {
       stopScanner();
     };
   }, []);
 
   const handleConfirm = () => {
     if (scannedAddress && validationResult?.valid) {
       onScan(scannedAddress);
       onClose();
     }
   };
 
   const handleRetry = () => {
     setScannedAddress(null);
     setValidationResult(null);
     setError(null);
     startScanner();
   };
 
   const getChainName = () => {
     switch (chain) {
       case 'solana': return 'Solana';
       case 'sui': return 'Sui';
       case 'base': return 'Base';
       case 'ethereum': return 'Ethereum';
       default: return 'Unknown';
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
       <DialogContent className="sm:max-w-md bg-background border-border">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <Camera className="h-5 w-5" />
             Scan Wallet QR Code
           </DialogTitle>
           <DialogDescription>
             Scan a {getChainName()} wallet address QR code
           </DialogDescription>
         </DialogHeader>
 
         <div className="space-y-4">
           {/* Security Notice */}
           <Alert className="border-primary/30 bg-primary/5">
             <Shield className="h-4 w-4 text-primary" />
             <AlertDescription className="text-xs">
               <strong>Security:</strong> Always verify the address matches your intended recipient before confirming.
             </AlertDescription>
           </Alert>
 
           {/* Scanner Container */}
           {!scannedAddress && (
             <div 
               ref={containerRef}
               className="relative bg-secondary/30 rounded-lg overflow-hidden"
             >
               <div 
                 id="qr-reader" 
                 className="w-full"
                 style={{ minHeight: '280px' }}
               />
               
               {cameraPermission === 'pending' && isScanning && (
                 <div className="absolute inset-0 flex items-center justify-center bg-secondary/80">
                   <div className="text-center space-y-2">
                     <Camera className="h-8 w-8 mx-auto animate-pulse text-primary" />
                     <p className="text-sm text-muted-foreground">Requesting camera access...</p>
                   </div>
                 </div>
               )}
             </div>
           )}
 
           {/* Error Display */}
           {error && (
             <Alert variant="destructive">
               <AlertCircle className="h-4 w-4" />
               <AlertDescription>{error}</AlertDescription>
             </Alert>
           )}
 
           {/* Scanned Result */}
           {scannedAddress && validationResult && (
             <div className="space-y-3">
               <div className={`p-3 rounded-lg border ${
                 validationResult.valid 
                   ? 'border-primary/30 bg-primary/5' 
                   : 'border-destructive/30 bg-destructive/5'
               }`}>
                 <div className="flex items-start gap-2">
                   {validationResult.valid ? (
                     <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                   ) : (
                     <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                   )}
                   <div className="flex-1 min-w-0">
                     <p className={`text-sm font-medium ${
                       validationResult.valid ? 'text-primary' : 'text-destructive'
                     }`}>
                       {validationResult.message}
                     </p>
                     <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                       {scannedAddress}
                     </p>
                   </div>
                 </div>
               </div>
 
               <div className="flex gap-2">
                 <Button
                   variant="outline"
                   className="flex-1"
                   onClick={handleRetry}
                 >
                   Scan Again
                 </Button>
                 {validationResult.valid && (
                   <Button
                     className="flex-1"
                     onClick={handleConfirm}
                   >
                     <Check className="h-4 w-4 mr-1" />
                     Use Address
                   </Button>
                 )}
               </div>
             </div>
           )}
 
           {/* Retry Button for Errors */}
           {error && !scannedAddress && (
             <Button
               variant="outline"
               className="w-full"
               onClick={handleRetry}
             >
               Try Again
             </Button>
           )}
         </div>
       </DialogContent>
     </Dialog>
   );
 };