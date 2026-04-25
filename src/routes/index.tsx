import { createFileRoute } from "@tanstack/react-router";
import { NedaApp } from "@/components/neda/NedaApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEDA — peer-to-peer emergency messaging" },
      {
        name: "description",
        content:
          "NEDA: peer-to-peer emergency messaging for internet shutdowns and political crises.",
      },
      { property: "og:title", content: "NEDA — peer-to-peer emergency messaging" },
      {
        property: "og:description",
        content:
          "For there is always light, if only we're brave enough to see it. If only we're brave enough to be it. — Amanda Gorman",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <NedaApp />;
}
