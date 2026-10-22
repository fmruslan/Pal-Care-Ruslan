import { Search } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { findTwin } from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { TwinList } from "@/components/vault";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Purchase vault" };

export default async function Vault({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
  }>;
}) {
  const data = await getDemoData();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 128) : "";
  const category =
    typeof params.category === "string" ? params.category : "all";
  const categories = [
    ...new Set(data.products.map((product) => product.category)),
  ];
  const ids = data.twins
    .filter((twin) => {
      const product = findTwin(data, twin.id)?.product;
      return (
        product &&
        `${product.name} ${product.brand} ${product.model}`
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (category === "all" || product.category === category)
      );
    })
    .map((twin) => twin.id);
  return (
    <Shell active="/vault" source={data.source}>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">
        EVERYTHING, IN ITS PLACE
      </p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">Purchase vault</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        A living record for every purchase. Explore {data.twins.length} Purchase
        Twins. Samples and verified sandbox purchases are labeled separately.
      </p>
      <form
        action="/vault"
        role="search"
        className="my-7 flex flex-col gap-3 sm:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">Search purchases</span>
          <Search
            className="absolute top-4 left-4 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            placeholder="Find something you love…"
            defaultValue={q}
            className="bg-card pl-11"
            maxLength={128}
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select
            aria-label="Category"
            name="category"
            defaultValue={categories.includes(category) ? category : "all"}
            className="h-12 w-full rounded-xl border bg-card px-4 text-sm sm:w-40"
          >
            <option value="all">All categories</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button type="submit" className="rounded-xl">
          Search
        </Button>
      </form>
      <p role="status" className="mb-5 text-xs text-muted-foreground">
        {ids.length} purchase{ids.length !== 1 && "s"}
        {q && ` matching “${q}”`}
      </p>
      <TwinList data={data} ids={ids} />
    </Shell>
  );
}
