export type DesignDevice = {
    id: string;
    label: string;
    width: number | "fluid";
    height: number | "fluid";
    group: "Phone" | "Tablet" | "Desktop";
};

export const DESIGN_DEVICES: DesignDevice[] = [
    { id: "fluid", label: "Fit canvas", width: "fluid", height: "fluid", group: "Desktop" },
    { id: "desktop-1440", label: "Desktop 1440", width: 1440, height: 900, group: "Desktop" },
    { id: "desktop-1920", label: "Full HD 1920", width: 1920, height: 1080, group: "Desktop" },
    { id: "macbook-air-13", label: "MacBook Air 13\"", width: 1280, height: 832, group: "Desktop" },
    { id: "imac-24", label: "iMac 24\"", width: 1920, height: 1080, group: "Desktop" },
    { id: "ipad-mini", label: "iPad mini", width: 744, height: 1133, group: "Tablet" },
    { id: "ipad-air", label: "iPad Air", width: 820, height: 1180, group: "Tablet" },
    { id: "ipad-pro-11", label: "iPad Pro 11\"", width: 834, height: 1194, group: "Tablet" },
    { id: "ipad-pro-13", label: "iPad Pro 13\"", width: 1024, height: 1366, group: "Tablet" },
    { id: "iphone-se", label: "iPhone SE", width: 375, height: 667, group: "Phone" },
    { id: "iphone-16", label: "iPhone 16", width: 393, height: 852, group: "Phone" },
    { id: "iphone-16-plus", label: "iPhone 16 Plus", width: 430, height: 932, group: "Phone" },
    { id: "iphone-16-pro", label: "iPhone 16 Pro", width: 402, height: 874, group: "Phone" },
    { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", width: 440, height: 956, group: "Phone" },
    { id: "galaxy-s24", label: "Galaxy S24", width: 360, height: 780, group: "Phone" },
    { id: "galaxy-s24-ultra", label: "Galaxy S24 Ultra", width: 384, height: 824, group: "Phone" },
    { id: "pixel-8", label: "Pixel 8", width: 412, height: 915, group: "Phone" },
    { id: "pixel-8-pro", label: "Pixel 8 Pro", width: 448, height: 998, group: "Phone" },
];

export const DEFAULT_DEVICE = DESIGN_DEVICES[0];
