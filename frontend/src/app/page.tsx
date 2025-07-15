import Image from "next/image";
import { API_URL } from "@/lib/config";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div className="text-4xl">Wyat AI</div>
        <div className="text-2xl">Current API URL: {API_URL}</div>
      </main>
    </div>
  );
}
