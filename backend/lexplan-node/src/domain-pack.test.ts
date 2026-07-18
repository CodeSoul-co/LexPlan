import { describe, expect, it } from 'vitest';
import {
  compileDomainPackToHarnessedSystem,
  compileWorkflowToFSM,
  validateDomainPackSpec,
} from '@hypha/domain';
import {
  LEGAL_STUDY_DOMAIN_PACK_ID,
  LEGAL_STUDY_DOMAIN_PACK_VERSION,
  legalStudyDomainPack,
} from './domain-pack';
import { LEGAL_STUDY_TOOL_IDS } from './tools';

describe('@lexplan/backend DomainPack', () => {
  it('validates the legal-study DomainPack', () => {
    const validated = validateDomainPackSpec(legalStudyDomainPack);

    expect(validated.id).toBe(LEGAL_STUDY_DOMAIN_PACK_ID);
    expect(validated.version).toBe(LEGAL_STUDY_DOMAIN_PACK_VERSION);
    expect(validated.workflows.map((workflow) => workflow.id)).toEqual([
      'workflow.legal-study.daily-plan-adjustment',
      'workflow.legal-study.textbook-card-ingestion',
      'workflow.legal-study.chapter-unlock-review',
    ]);
  });

  it('compiles each workflow to an FSM process', () => {
    const workflowIds = legalStudyDomainPack.workflows.map((workflow) => workflow.id);

    for (const workflowId of workflowIds) {
      const fsm = compileWorkflowToFSM(legalStudyDomainPack, { workflowId });
      expect(fsm.id).toBe(`${LEGAL_STUDY_DOMAIN_PACK_ID}.${workflowId}.fsm`);
      expect(fsm.states.length).toBeGreaterThan(2);
      expect(fsm.terminalStates.length).toBeGreaterThan(0);
    }
  });

  it('compiles the default workflow into harness bindings', () => {
    const compiled = compileDomainPackToHarnessedSystem(legalStudyDomainPack, {
      agentRef: { id: 'agent.legal-study.planner', version: LEGAL_STUDY_DOMAIN_PACK_VERSION },
    });

    expect(compiled.fsmProcess).toMatchObject({
      initialState: 'ContextBuilt',
      terminalStates: ['Applied', 'Rejected', 'Failed'],
    });
    expect(compiled.harnessedSystem).toMatchObject({
      id: `${LEGAL_STUDY_DOMAIN_PACK_ID}.workflow.legal-study.daily-plan-adjustment.system`,
      agentRef: { id: 'agent.legal-study.planner', version: LEGAL_STUDY_DOMAIN_PACK_VERSION },
      memoryRefs: [{ id: 'memory.legal-study.local', version: LEGAL_STUDY_DOMAIN_PACK_VERSION }],
      contextRefs: [{ id: 'context.legal-study.agent', version: LEGAL_STUDY_DOMAIN_PACK_VERSION }],
      reasoningRefs: [
        { id: 'reasoning.legal-study.structured', version: LEGAL_STUDY_DOMAIN_PACK_VERSION },
      ],
    });
    expect(compiled.agentPatch.toolRefs).toContain(LEGAL_STUDY_TOOL_IDS.readLearningSnapshot);
    expect(compiled.agentPatch.policyRefs).toContain('policy.legal-study.read-analysis');
  });
});
