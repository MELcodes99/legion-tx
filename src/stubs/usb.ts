// Stub for usb package to prevent native compilation errors
// This package is only used by hardware wallet adapters (Ledger, Trezor)
// which are not needed for browser-based wallet connections

export default {};
export const usb = {};
export const getDeviceList = () => [];
export const findByIds = () => null;
export const LIBUSB_CLASS_HID = 3;
export const LIBUSB_ENDPOINT_IN = 0x80;
export const LIBUSB_ENDPOINT_OUT = 0x00;
export const LIBUSB_TRANSFER_TYPE_INTERRUPT = 3;
