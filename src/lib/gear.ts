// Map stored gear rows to the lean `Option` shape the selects consume. Shared
// by the review, activity-detail and settings pages so the projection lives once.
import type { Bike, BikeOption, Shoe, ShoeOption } from "./types";

export function toShoeOption(shoe: Pick<Shoe, "id" | "name" | "role" | "retired_at">): ShoeOption {
  return { id: shoe.id, name: shoe.name, role: shoe.role, retired: !!shoe.retired_at };
}

export function toBikeOption(bike: Pick<Bike, "id" | "name" | "role" | "retired_at">): BikeOption {
  return { id: bike.id, name: bike.name, role: bike.role, retired: !!bike.retired_at };
}
