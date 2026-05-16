import "./globals.css";
import BackendStatusGate from "@/components/BackendStatusGate";

export const metadata = {
  title: "ScanApp Packing",
  description: "Wholesale grocery packing checklist with barcode scanning",
  manifest: "/manifest.json",
  icons: {
    icon: "/store-logo.jpeg",
    apple: "/store-logo.jpeg"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ScanApp"
  }
};

export const viewport = {
  themeColor: "#2f7d46"
};

export default function RootLayout({ children }) {
  return (
    <html lang="mr">
      <body>
        <BackendStatusGate>{children}</BackendStatusGate>
      </body>
    </html>
  );
}
