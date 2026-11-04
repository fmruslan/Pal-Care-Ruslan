import {
  ownershipHref,
  ownershipTopic,
  type OwnershipTopic,
} from "./ownership-contracts";

export type OwnershipPresentation = {
  twinId: string;
  topic: OwnershipTopic;
  revision: string;
};
export function careHomepagePostcondition(
  expected: OwnershipPresentation,
  actual: {
    pathname: string;
    twinId?: string;
    topic?: string;
    revision?: string;
    visible: boolean;
    facts: number;
  },
) {
  return (
    actual.pathname === "/dashboard" &&
    actual.twinId === expected.twinId &&
    actual.topic === expected.topic &&
    actual.revision === expected.revision &&
    actual.visible &&
    actual.facts > 0
  );
}
/** Presentation-only validation. Nothing here grants record/financial authority. */
export function ownershipPresentationTarget(value: OwnershipPresentation) {
  if (!ownershipTopic(value.topic) || !/^[a-f0-9]{1,8}$/.test(value.revision))
    throw Error("invalid_ownership_presentation");
  return ownershipHref(value.twinId, value.topic);
}
export function ownershipPostcondition(
  expected: OwnershipPresentation,
  actual: {
    pathname: string;
    milestone: string | null;
    twinId?: string;
    topic?: string;
    revision?: string;
    open: boolean;
    visible: boolean;
    facts: number;
  },
) {
  return (
    actual.pathname === `/vault/${expected.twinId}` &&
    actual.milestone === expected.topic &&
    actual.twinId === expected.twinId &&
    actual.topic === expected.topic &&
    actual.revision === expected.revision &&
    actual.open &&
    actual.visible &&
    actual.facts > 0
  );
}
