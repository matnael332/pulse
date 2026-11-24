// Places in the site that the public demo fills (demo/start.ts): its way in, what it explains along
// the way, its links. The site itself leaves them empty, so nothing is rendered there.
import type { ComponentProps, ComponentType } from "react";

export type Step = "read" | "review" | "prepare" | "model" | "failed";
export type Area = "sky" | "table" | "trend" | "distribution" | "reasons" | "data";

export interface Slots {
  entry: ComponentType<{ short?: boolean }>;
  links: ComponentType<object>;
  banner: ComponentType<object>;
  foot: ComponentType<object>;
  guide: ComponentType<object>;
  explain: ComponentType<{ step: Step }>;
  note: ComponentType<{ area: Area }>;
}

export const slots: Partial<Slots> = {};

export function Slot<K extends keyof Slots>({
  name,
  ...props
}: { name: K } & ComponentProps<Slots[K]>) {
  const Fill = slots[name] as ComponentType<object> | undefined;
  return Fill ? <Fill {...props} /> : null;
}
