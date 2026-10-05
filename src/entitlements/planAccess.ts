import type { PaidPlan } from './planCatalog';

export const PLAN_UPGRADE_EVENT = 'tp:open-plan-upgrade';

export type PlanUpgradeRequest = {
  requiredPlan: PaidPlan;
  feature?: string;
};

export function openPlanUpgrade(request: PlanUpgradeRequest) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PlanUpgradeRequest>(PLAN_UPGRADE_EVENT, {
      detail: request,
    }),
  );
}

export function planRequirementProps(requiredPlan: PaidPlan, feature: string) {
  return {
    'data-required-plan': requiredPlan,
    'data-plan-feature': feature,
  };
}
