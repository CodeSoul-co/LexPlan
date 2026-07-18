import { type ToolCallContext, type ToolHandler, type ToolRegistry } from '@hypha/tools';
import { legalStudyToolSpecs } from '../tools';

export type LegalStudyToolDispatcher = (
  toolId: string,
  input: unknown,
  context: ToolCallContext
) => Promise<unknown>;

export function registerLegalStudyTools(
  registry: ToolRegistry,
  dispatch: LegalStudyToolDispatcher
): void {
  for (const spec of legalStudyToolSpecs) {
    const handler: ToolHandler = (input, context) => dispatch(spec.id, input, context);
    registry.register(spec, handler);
  }
}
