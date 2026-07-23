// Map a stored gear row (shoe or bike) to the lean `GearOption` shape the
// selects consume. Shared by the review, activity-detail and settings pages so
// the projection lives once. Both entities extend the same `Gear` base, so a
// single parameterized projection serves both.
import type { Gear, GearOption } from "./types";

export function toGearOption(gear: Pick<Gear, "id" | "name" | "role" | "retired_at">): GearOption {
  return { id: gear.id, name: gear.name, role: gear.role, retired: !!gear.retired_at };
}
