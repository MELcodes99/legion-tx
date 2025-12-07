// Stub for native USB module - prevents build errors when bundling for web
// This module is a transitive dependency from hardware wallet adapters that we don't use

export const usb = null;
export const getDeviceList = () => [];
export const findByIds = () => null;
export const LIBUSB_CLASS_HID = 3;
export const LIBUSB_ENDPOINT_IN = 0x80;
export const LIBUSB_ENDPOINT_OUT = 0x00;
export const LIBUSB_TRANSFER_TYPE_INTERRUPT = 1;

// Export everything as default too
const stub = {
  usb: null,
  getDeviceList: () => [],
  findByIds: () => null,
  LIBUSB_CLASS_HID: 3,
  LIBUSB_TRANSFER_TYPE_INTERRUPT: 1,
};

export default stub;

// For node-hid stub
export const devices = () => [];
export const HID = class HID {
  constructor() {
    throw new Error('HID not supported in browser');
  }
};
