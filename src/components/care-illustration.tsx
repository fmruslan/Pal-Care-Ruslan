import { FileText, Heart, Package, ShieldCheck } from "lucide-react";

export function CareIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex aspect-square w-56 items-center justify-center sm:w-64"
    >
      <div className="absolute inset-3 rounded-full border border-white/15" />
      <div className="absolute inset-9 rounded-full border border-dashed border-white/20" />
      <div className="absolute inset-14 rounded-full bg-[#d9e9c8]/10" />
      <div className="relative flex size-28 -rotate-6 items-center justify-center rounded-[2rem] border border-[#dce9c8] bg-[#e4edce] shadow-[12px_18px_0_0_#122f2a]">
        <Package strokeWidth={1.2} className="size-16 text-primary" />
      </div>
      <span className="absolute right-4 top-9 flex size-12 rotate-12 items-center justify-center rounded-2xl bg-[#e9b9a6] text-primary shadow-lg">
        <Heart className="size-6" />
      </span>
      <span className="absolute bottom-7 right-7 flex size-14 -rotate-12 items-center justify-center rounded-2xl bg-white text-primary shadow-lg">
        <ShieldCheck className="size-7" />
      </span>
      <span className="absolute left-2 top-20 flex size-12 -rotate-12 items-center justify-center rounded-2xl bg-white text-primary shadow-lg">
        <FileText className="size-6" />
      </span>
    </div>
  );
}
