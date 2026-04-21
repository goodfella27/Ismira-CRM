import { LogoStackSlider } from "@/components/logo-stack-slider";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[72vh] w-full max-w-5xl flex-col items-center justify-center px-8 py-16 text-center">
      <LogoStackSlider className="mb-10" />
      <h1 className="text-balance text-5xl font-semibold tracking-tight text-slate-900 sm:text-7xl">
        Discover real-world
      </h1>
      <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
        Placeholder slider with gradient “logos” that stack and loop. Swap each
        item for a real logo later.
      </p>
    </main>
  );
}
