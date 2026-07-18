import type { PolicyDecision, PolicyEngine, PolicyEvaluationContext } from '@hypha/core';

export const LEGAL_STUDY_POLICY_IDS = {
  readAnalysis: 'policy.legal-study.read-analysis',
  humanReviewedWrite: 'policy.legal-study.human-reviewed-write',
  denied: 'policy.legal-study.denied',
} as const;

export function createLegalStudyToolPolicyEngine(): PolicyEngine {
  return {
    async evaluate(context: PolicyEvaluationContext): Promise<PolicyDecision> {
      return evaluateLegalStudyToolPolicy(context);
    },
  };
}

export function evaluateLegalStudyToolPolicy(context: PolicyEvaluationContext): PolicyDecision {
  if (context.sideEffectLevel === 'external_effect' || context.sideEffectLevel === 'irreversible') {
    return {
      allowed: false,
      policyId: LEGAL_STUDY_POLICY_IDS.denied,
      reason: `Legal-study tools do not allow ${context.sideEffectLevel} side effects.`,
    };
  }

  if (context.sideEffectLevel === 'none' || context.sideEffectLevel === 'read') {
    return {
      allowed: true,
      policyId: LEGAL_STUDY_POLICY_IDS.readAnalysis,
      ruleId: 'policy.legal-study.allow-read',
    };
  }

  if (context.sideEffectLevel === 'write') {
    if (
      context.capabilityId === 'tool.legal-study.bilibili-import' &&
      context.metadata?.approvalMode === 'explicit_user_command' &&
      context.metadata?.principalType === 'user'
    ) {
      return {
        allowed: true,
        policyId: LEGAL_STUDY_POLICY_IDS.humanReviewedWrite,
        ruleId: 'policy.legal-study.explicit-bilibili-import',
        reason: 'The authenticated user explicitly requested this idempotent course import.',
      };
    }
    return {
      allowed: true,
      requiresHumanReview: true,
      policyId: LEGAL_STUDY_POLICY_IDS.humanReviewedWrite,
      ruleId: 'policy.legal-study.require-human-review',
      reason: 'Legal-study write tools require explicit human approval.',
    };
  }

  return {
    allowed: false,
    policyId: LEGAL_STUDY_POLICY_IDS.denied,
    reason: 'Unsupported legal-study tool side effect level.',
  };
}
