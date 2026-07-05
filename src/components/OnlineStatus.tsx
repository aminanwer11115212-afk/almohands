import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-xs py-1.5 px-3 text-center flex items-center justify-center gap-2 shadow">
      <WifiOff className="size-3.5" />
      وضع عدم الاتصال — البيانات المعروضة من الذاكرة المؤقتة
    </div>
  );
}
