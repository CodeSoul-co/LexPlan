import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import {
  createManualBilibiliImportPreview,
  legalStudyDomainPack,
  legalStudyToolSpecs,
} from '../index';
import type {
  ImportedEpisodeDraft,
  LegalStudyCardStatus,
  LegalStudyDailyPlan,
  LegalStudyProposalDecision,
  LegalStudyJobStatus,
  LegalStudyJobType,
  LegalStudyReviewRating,
  LegalStudySubjectCode,
  LegalStudyTaskStatus,
} from '../index';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { HTTP_STATUS } from '../constants';
import {
  getLegalStudyRuntime,
  getLegalStudyRuntimePersistenceStatus,
  hydrateLegalStudyRuntime,
  persistLegalStudyRuntime,
} from '../services/LegalStudyRuntime';

const router = Router();
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const OCR_UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'ocr', 'uploads');
router.use((req, res, next) => {
  hydrateLegalStudyRuntime()
    .then(() => next())
    .catch(next);
});

router.use((req, res, next) => {
  if (!WRITE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }
  res.on('finish', () => {
    if (res.statusCode < 400) {
      void persistLegalStudyRuntime().catch(() => undefined);
    }
  });
  next();
});
router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    const state = getLegalStudyRuntime().getState();
    res.json({
      success: true,
      data: {
        status: 'ready',
        mode: getLegalStudyRuntimePersistenceStatus().store,
        timestamp: new Date().toISOString(),
        deepseek: deepSeekStatus(),
        providerHealth: await legalStudyProviderHealth(),
        persistence: getLegalStudyRuntimePersistenceStatus(),
        counts: {
          subjects: state.snapshot.subjects.length,
          courses: state.snapshot.courses.length,
          episodes: state.snapshot.episodes.length,
          textbooks: state.snapshot.textbooks.length,
          chapters: state.snapshot.chapters.length,
          cards: state.snapshot.cards.length,
          reviewStates: state.snapshot.reviewStates.length,
          proposals: state.proposals.length,
          jobs: state.jobs.length,
        },
      },
    });
  })
);

router.get(
  '/snapshot',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: getLegalStudyRuntime().getState(),
    });
  })
);

router.get(
  '/state',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: getLegalStudyRuntime().getState(),
    });
  })
);
router.post(
  '/reset',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().reset(stringField(req.body, 'userId')),
    });
  })
);

router.get(
  '/capabilities',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        domainPack: {
          id: legalStudyDomainPack.id,
          version: legalStudyDomainPack.version,
          workflows: legalStudyDomainPack.workflows.map((workflow) => workflow.id),
          taskSchemas: legalStudyDomainPack.taskSchemas.map((task) => task.taskType),
        },
        coreLinks: [
          'course-planning',
          'textbook-to-card',
          'chapter-mapping-unlock',
          'fsrs-review-agent-control',
        ],
        providers: {
          ocr: 'ocr.paddle-http',
          bilibili:
            process.env.BILIBILI_PROVIDER === 'real' ? 'real-public-metadata' : 'mock-provider',
          cardGeneration: deepSeekStatus().configured ? 'deepseek' : 'deterministic-fallback',
          agentInsight: agentInsightStatus().enabled ? 'deepseek-explanation' : 'rule-explanation',
          store: getLegalStudyRuntimePersistenceStatus().store,
          asyncJobs: 'in-process-local-worker',
        },
        deepseek: deepSeekStatus(),
        agentInsight: agentInsightStatus(),
        providerHealth: await legalStudyProviderHealth(),
        tools: legalStudyToolSpecs.map((tool) => ({
          id: tool.id,
          sideEffectLevel: tool.sideEffectLevel,
          permissionScope: tool.permissionScope,
          requiresHumanApproval: Boolean(tool.humanApprovalPolicy?.required),
        })),
      },
    });
  })
);

router.get(
  '/domain-pack',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: legalStudyDomainPack,
    });
  })
);

router.get(
  '/tools',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: legalStudyToolSpecs,
    });
  })
);

router.post(
  '/files/upload',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const fileName = sanitizeUploadFileName(requiredString(body, 'fileName'));
    const mimeType = stringField(body, 'mimeType') ?? 'application/octet-stream';
    const contentBase64 = requiredString(body, 'contentBase64').replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Uploaded file content cannot be empty.',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    await mkdir(OCR_UPLOAD_DIR, { recursive: true });
    const storedFileName = `${Date.now()}-${fileName}`;
    const absolutePath = path.join(OCR_UPLOAD_DIR, storedFileName);
    await writeFile(absolutePath, buffer);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        fileName: storedFileName,
        originalFileName: fileName,
        mimeType,
        sizeBytes: buffer.length,
        fileRef: `upload://${storedFileName}`,
        filePath: `/data/uploads/${storedFileName}`,
        localPath: absolutePath,
      },
    });
  })
);
router.get(
  '/jobs',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listJobs({
        userId: stringField(req.query, 'userId'),
        type: jobTypeField(req.query, 'type'),
        status: jobStatusField(req.query, 'status'),
      }),
    });
  })
);

router.post(
  '/jobs',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const job = await getLegalStudyRuntime().enqueueJob(
      requiredJobType(body, 'type'),
      isRecord(body.input) ? body.input : {},
      {
        userId: stringField(body, 'userId'),
        now: stringField(body, 'now'),
        start: booleanField(body, 'start') ?? false,
      }
    );
    res.status(HTTP_STATUS.ACCEPTED).json({
      success: true,
      data: {
        job,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.get(
  '/jobs/:jobId',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await getLegalStudyRuntime().getJob(req.params.jobId);
    if (!job) {
      throw new AppError('NOT_FOUND', `Job not found: ${req.params.jobId}`, HTTP_STATUS.NOT_FOUND);
    }
    res.json({ success: true, data: job });
  })
);

router.post(
  '/jobs/:jobId/run',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await getLegalStudyRuntime().runJob(req.params.jobId);
    res.json({
      success: job.status === 'succeeded',
      data: {
        job,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.post(
  '/jobs/:jobId/retry',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await getLegalStudyRuntime().retryJob(req.params.jobId);
    res.json({
      success: job.status === 'succeeded',
      data: {
        job,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.post(
  '/jobs/:jobId/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const job = await getLegalStudyRuntime().cancelJob(req.params.jobId);
    res.json({
      success: true,
      data: {
        job,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.post(
  '/tools/:toolId/run',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const runtime = getLegalStudyRuntime();
    const userId = runtime.getSnapshot().userId;
    const result = await runtime.runGovernedTool(
      req.params.toolId,
      isRecord(body.input) ? body.input : body,
      {
        runId: stringField(body, 'runId') ?? `legal-study-${Date.now()}`,
        stepId: stringField(body, 'stepId') ?? req.params.toolId,
        userId,
        sessionId: stringField(body, 'sessionId'),
        invocationId: stringField(body, 'invocationId'),
        idempotencyKey: stringField(body, 'idempotencyKey') ?? stringField(body, 'invocationId'),
        principal: {
          id: userId,
          type: 'user',
          permissionScopes: ['legal-study:read', 'legal-study:write'],
        },
        metadata: { transport: 'http' },
      }
    );
    res.status(toolStatusCode(result.status)).json({
      success: result.status === 'completed',
      data: {
        result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.post(
  '/tools/approvals/:invocationId/approve',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const runtime = getLegalStudyRuntime();
    const result = await runtime.approveAndResumeTool(
      req.params.invocationId,
      runtime.getSnapshot().userId,
      {
        approvedAt: stringField(body, 'approvedAt'),
        expiresAt: stringField(body, 'expiresAt'),
      }
    );
    res.status(toolStatusCode(result.status)).json({
      success: result.status === 'completed',
      data: {
        result,
        state: runtime.getState(),
      },
    });
  })
);

router.post(
  '/tools/approvals/:invocationId/reject',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getLegalStudyRuntime().rejectToolInvocation(req.params.invocationId);
    res.status(toolStatusCode(result.status)).json({
      success: false,
      data: { result },
    });
  })
);

router.get(
  '/tools/invocations/:invocationId',
  asyncHandler(async (req: Request, res: Response) => {
    const invocation = await getLegalStudyRuntime().getToolInvocation(req.params.invocationId);
    if (!invocation) {
      throw new AppError(
        'TOOL_INVOCATION_NOT_FOUND',
        'Tool invocation not found',
        HTTP_STATUS.NOT_FOUND
      );
    }
    res.json({ success: true, data: invocation });
  })
);

router.post(
  '/tools/invocations/:invocationId/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const result = await getLegalStudyRuntime().cancelToolInvocation(
      req.params.invocationId,
      stringField(body, 'reason')
    );
    res.status(toolStatusCode(result.status)).json({
      success: false,
      data: { result },
    });
  })
);
router.get(
  '/courses/subjects',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listSubjects(),
    });
  })
);

router.post(
  '/courses/subjects',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const subject = await getLegalStudyRuntime().createSubject({
      userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
      code: requiredString(body, 'code') as LegalStudySubjectCode,
      name: requiredString(body, 'name'),
      priority: numberField(body, 'priority'),
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        subject,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.get(
  '/courses',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listCourses(stringField(req.query, 'subjectId')),
    });
  })
);

router.post(
  '/courses',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const course = await getLegalStudyRuntime().createCourse({
      userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
      subjectId: requiredString(body, 'subjectId'),
      title: requiredString(body, 'title'),
      deadline: requiredString(body, 'deadline'),
      source: stringField(body, 'source') as 'manual' | 'bilibili' | 'imported' | undefined,
      sourceRef: stringField(body, 'sourceRef'),
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        course,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.post(
  '/courses/bilibili-preview',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const url = requiredString(body, 'url');
    const titleHint = stringField(body, 'titleHint');
    let preview;
    try {
      preview = await getLegalStudyRuntime().previewBilibiliCourse({
        url,
        titleHint,
      });
    } catch (error) {
      preview = createManualBilibiliImportPreview({
        url,
        titleHint,
        warning: error instanceof Error ? error.message : String(error),
        episodes: importedEpisodeDraftsField(body, 'episodes') as
          ImportedEpisodeDraft[] | undefined,
      });
    }
    res.json({
      success: true,
      data: {
        preview,
        manualCorrection: {
          editableFields: [
            'title',
            'episodes.title',
            'episodes.durationMinutes',
            'episodes.order',
            'episodes.selected',
          ],
          acceptedFallbacks: ['manual-entry', 'paste-episode-json', 'upload-course-catalog-json'],
          episodeJsonShape: {
            title: '课程标题，可选',
            episodes: [
              {
                title: '分P标题',
                durationMinutes: 45,
                order: 1,
                sourceUrl: 'https://www.bilibili.com/video/BV.../?p=1',
              },
            ],
          },
          deleteEpisodeBySettingSelectedFalse: true,
        },
      },
    });
  })
);

router.post(
  '/courses/bilibili-confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const result = await getLegalStudyRuntime().confirmBilibiliCourseImport({
      userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
      subjectId: requiredString(body, 'subjectId'),
      deadline: requiredString(body, 'deadline'),
      preview: requiredBilibiliPreview(body, 'preview'),
      title: stringField(body, 'title'),
      episodes: importedEpisodeDraftsField(body, 'episodes'),
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.post(
  '/courses/bilibili-import-async',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const job = await getLegalStudyRuntime().enqueueBilibiliImportJob(
      {
        userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
        subjectId: requiredString(body, 'subjectId'),
        url: requiredString(body, 'url'),
        deadline: requiredString(body, 'deadline'),
        titleHint: stringField(body, 'titleHint'),
        now: stringField(body, 'now'),
      },
      { start: booleanField(body, 'start') ?? true }
    );
    res.status(HTTP_STATUS.ACCEPTED).json({
      success: true,
      data: {
        job,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.post(
  '/courses/bilibili-import',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const result = await getLegalStudyRuntime().importBilibiliCourse({
      userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
      subjectId: requiredString(body, 'subjectId'),
      url: requiredString(body, 'url'),
      deadline: requiredString(body, 'deadline'),
      titleHint: stringField(body, 'titleHint'),
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.get(
  '/courses/:courseId/episodes',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listEpisodes(req.params.courseId),
    });
  })
);

router.post(
  '/courses/:courseId/episodes',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const episode = await getLegalStudyRuntime().addEpisode({
      userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
      courseId: req.params.courseId,
      title: requiredString(body, 'title'),
      order: numberField(body, 'order'),
      durationMinutes: requiredNumber(body, 'durationMinutes'),
      status: stringField(body, 'status') as LegalStudyTaskStatus | undefined,
      lockedByUser: booleanField(body, 'lockedByUser'),
      sourceRef: stringField(body, 'sourceRef'),
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        episode,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.get(
  '/courses/:courseId/overview',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().getCourseOverview(req.params.courseId),
    });
  })
);

router.post(
  '/episodes/:episodeId/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getLegalStudyRuntime().completeCourseEpisode(
      req.params.episodeId,
      stringField(req.body, 'completedAt') ?? new Date().toISOString()
    );
    res.json({
      success: true,
      data: {
        ...result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.get(
  '/agent/risk',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().getAgentRiskDashboard(
        stringField(req.query, 'date') ?? '2026-07-07'
      ),
    });
  })
);

router.get(
  '/agent/proposals',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listAgentProposals({
        status: stringField(req.query, 'status') as LegalStudyProposalDecision | undefined,
      }),
    });
  })
);

router.post(
  '/agent/proposals/recompute-async',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const job = await getLegalStudyRuntime().enqueueAgentProposalRecomputeJob(
      {
        userId: stringField(body, 'userId'),
        date: stringField(body, 'date') ?? '2026-07-07',
        now: stringField(body, 'now'),
        windowDays: numberField(body, 'windowDays'),
      },
      { start: booleanField(body, 'start') ?? true }
    );
    res.status(HTTP_STATUS.ACCEPTED).json({
      success: true,
      data: {
        job,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.post(
  '/agent/proposals',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const proposal = await getLegalStudyRuntime().draftAgentProposal(
      stringField(body, 'date') ?? '2026-07-07',
      stringField(body, 'now') ?? new Date().toISOString(),
      numberField(body, 'windowDays')
    );
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        proposal,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.patch(
  '/agent/proposals/:proposalId',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const proposal = await getLegalStudyRuntime().modifyAgentProposal({
      proposalId: req.params.proposalId,
      afterPlan: requiredDailyPlan(body, 'afterPlan'),
      summary: stringField(body, 'summary'),
      reason: stringField(body, 'reason'),
      now: stringField(body, 'now'),
    });
    res.json({
      success: true,
      data: {
        proposal,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.post(
  '/agent/proposals/:proposalId/decision',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const proposal = await getLegalStudyRuntime().decideAgentProposal({
      proposalId: req.params.proposalId,
      decision: requiredDecision(body),
      reason: stringField(body, 'reason'),
      decidedAt: stringField(body, 'decidedAt'),
    });
    res.json({
      success: true,
      data: {
        proposal,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.get(
  '/reviews/new-cards',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listNewCards({
        subjectId: stringField(req.query, 'subjectId'),
        limit: numberField(req.query, 'limit'),
      }),
    });
  })
);

router.get(
  '/reviews/due',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().getDueReviewQueueDetailed({
        date: requiredString(req.query, 'date'),
        subjectId: stringField(req.query, 'subjectId'),
        limit: numberField(req.query, 'limit'),
      }),
    });
  })
);

router.get(
  '/reviews/pressure',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().computeReviewPressureDetailed(
        requiredString(req.query, 'date'),
        numberField(req.query, 'availableMinutes')
      ),
    });
  })
);

router.post(
  '/reviews/learn',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const result = await getLegalStudyRuntime().learnNewCard({
      cardId: requiredString(body, 'cardId'),
      learnedAt: stringField(body, 'learnedAt'),
      firstReviewAfterDays: numberField(body, 'firstReviewAfterDays'),
    });
    res.json({
      success: true,
      data: {
        ...result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.post(
  '/reviews/submit',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const result = await getLegalStudyRuntime().submitReview({
      cardId: requiredString(body, 'cardId'),
      rating: requiredReviewRating(body),
      reviewedAt: stringField(body, 'reviewedAt'),
    });
    res.json({
      success: true,
      data: {
        ...result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.get(
  '/mappings',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listMappings({
        episodeId: stringField(req.query, 'episodeId'),
        chapterId: stringField(req.query, 'chapterId'),
      }),
    });
  })
);

router.post(
  '/mappings/suggest',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    res.json({
      success: true,
      data: await getLegalStudyRuntime().suggestMappings({
        courseId: stringField(body, 'courseId'),
        subjectId: stringField(body, 'subjectId'),
        textbookId: stringField(body, 'textbookId'),
        minConfidence: numberField(body, 'minConfidence'),
        now: stringField(body, 'now'),
      }),
    });
  })
);

router.post(
  '/mappings/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const mapping = await getLegalStudyRuntime().confirmMapping({
      episodeId: requiredString(body, 'episodeId'),
      chapterId: requiredString(body, 'chapterId'),
      confidence: numberField(body, 'confidence'),
      reason: stringField(body, 'reason'),
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        mapping,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.patch(
  '/mappings/:mappingId',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const mapping = await getLegalStudyRuntime().modifyMapping(req.params.mappingId, {
      chapterId: stringField(body, 'chapterId'),
      confidence: numberField(body, 'confidence'),
      reason: stringField(body, 'reason'),
      now: stringField(body, 'now'),
    });
    res.json({
      success: true,
      data: {
        mapping,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.delete(
  '/mappings/:mappingId',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await getLegalStudyRuntime().deleteMapping(req.params.mappingId);
    res.json({
      success: true,
      data: {
        deleted,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.get(
  '/episodes/:episodeId/unlock-preview',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().getUnlockPreview(req.params.episodeId),
    });
  })
);

router.post(
  '/episodes/:episodeId/unlock',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await getLegalStudyRuntime().applyMappingUnlocks(
      req.params.episodeId,
      stringField(req.body, 'completedAt') ?? new Date().toISOString()
    );
    res.json({
      success: true,
      data: {
        ...result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.get(
  '/textbooks',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listTextbooks(stringField(req.query, 'subjectId')),
    });
  })
);

router.post(
  '/textbooks',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const textbook = await getLegalStudyRuntime().createTextbook({
      id: stringField(body, 'id'),
      userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
      subjectId: requiredString(body, 'subjectId'),
      title: requiredString(body, 'title'),
      fileRef: stringField(body, 'fileRef'),
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        textbook,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.post(
  '/textbooks/ingest-async',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const job = await getLegalStudyRuntime().enqueueTextbookIngestionJob(
      {
        userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
        subjectId: requiredString(body, 'subjectId'),
        textbookId: stringField(body, 'textbookId'),
        textbookTitle: requiredString(body, 'textbookTitle'),
        fileName: stringField(body, 'fileName'),
        fileRef: stringField(body, 'fileRef'),
        filePath: stringField(body, 'filePath'),
        mimeType: stringField(body, 'mimeType'),
        text: stringField(body, 'text'),
        pages: ocrPagesField(body, 'pages'),
        confirmCards: booleanField(body, 'confirmCards') ?? false,
        now: stringField(body, 'now'),
      },
      { start: booleanField(body, 'start') ?? true }
    );
    res.status(HTTP_STATUS.ACCEPTED).json({
      success: true,
      data: {
        job,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
router.post(
  '/textbooks/ingest',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const result = await getLegalStudyRuntime().ingestTextbookDetailed({
      userId: stringField(body, 'userId') ?? getLegalStudyRuntime().getSnapshot().userId,
      subjectId: requiredString(body, 'subjectId'),
      textbookId: stringField(body, 'textbookId'),
      textbookTitle: requiredString(body, 'textbookTitle'),
      fileName: stringField(body, 'fileName'),
      fileRef: stringField(body, 'fileRef'),
      filePath: stringField(body, 'filePath'),
      mimeType: stringField(body, 'mimeType'),
      text: stringField(body, 'text'),
      pages: ocrPagesField(body, 'pages'),
      confirmCards: booleanField(body, 'confirmCards') ?? false,
      now: stringField(body, 'now'),
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...result,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.get(
  '/textbooks/:textbookId/chapters',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listTextbookChapters(req.params.textbookId),
    });
  })
);

router.get(
  '/chapters/:chapterId/slices',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listChapterSlices(req.params.chapterId),
    });
  })
);

router.get(
  '/cards',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      data: await getLegalStudyRuntime().listCards({
        textbookId: stringField(req.query, 'textbookId'),
        chapterId: stringField(req.query, 'chapterId'),
        status: stringField(req.query, 'status') as LegalStudyCardStatus | undefined,
      }),
    });
  })
);

router.post(
  '/cards/confirm-batch',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const cards = await getLegalStudyRuntime().confirmCardBatch(
      requiredStringArray(body, 'cardIds'),
      stringField(body, 'now') ?? new Date().toISOString()
    );
    res.json({
      success: true,
      data: {
        cards,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);

router.patch(
  '/cards/:cardId',
  asyncHandler(async (req: Request, res: Response) => {
    const body = isRecord(req.body) ? req.body : {};
    const card = await getLegalStudyRuntime().updateCard(req.params.cardId, {
      front: stringField(body, 'front'),
      back: stringField(body, 'back'),
      status: stringField(body, 'status') as LegalStudyCardStatus | undefined,
      now: stringField(body, 'now'),
    });
    res.json({
      success: true,
      data: {
        card,
        state: getLegalStudyRuntime().getState(),
      },
    });
  })
);
function requiredJobType(body: unknown, key: string): LegalStudyJobType {
  const type = requiredString(body, key);
  const parsed = jobTypeField({ [key]: type }, key);
  if (!parsed) {
    throw new AppError(
      'VALIDATION_ERROR',
      'type must be textbook_ingestion, bilibili_import, or agent_proposal_recompute',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return parsed;
}

function jobTypeField(body: unknown, key: string): LegalStudyJobType | undefined {
  const value = isRecord(body) ? body[key] : undefined;
  if (
    value === 'textbook_ingestion' ||
    value === 'bilibili_import' ||
    value === 'agent_proposal_recompute'
  ) {
    return value;
  }
  return undefined;
}

function jobStatusField(body: unknown, key: string): LegalStudyJobStatus | undefined {
  const value = isRecord(body) ? body[key] : undefined;
  if (
    value === 'queued' ||
    value === 'processing' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'retrying' ||
    value === 'cancelled' ||
    value === 'needs_user_action'
  ) {
    return value;
  }
  return undefined;
}
function requiredDailyPlan(body: unknown, key: string): LegalStudyDailyPlan {
  const value = isRecord(body) ? body[key] : undefined;
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.date !== 'string' ||
    !Array.isArray(value.tasks)
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Missing required daily plan field: ${key}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return value as unknown as LegalStudyDailyPlan;
}
function requiredBilibiliPreview(body: unknown, key: string): any {
  const value = isRecord(body) ? body[key] : undefined;
  if (
    !isRecord(value) ||
    typeof value.title !== 'string' ||
    typeof value.sourceUrl !== 'string' ||
    !Array.isArray(value.episodes)
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Missing required Bilibili import preview field: ${key}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return value;
}

function importedEpisodeDraftsField(body: unknown, key: string): any[] | undefined {
  const value = isRecord(body) ? body[key] : undefined;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `${key} must be an array when provided`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return value.filter(isRecord).map((episode) => ({
    ...episode,
    title: typeof episode.title === 'string' ? episode.title : '',
    order: numberField(episode, 'order'),
    durationMinutes: numberField(episode, 'durationMinutes'),
    selected: booleanField(episode, 'selected'),
  }));
}
function ocrPagesField(
  body: unknown,
  key: string
): Array<{ pageNumber: number; text: string; confidence?: number }> | undefined {
  const value = isRecord(body) ? body[key] : undefined;
  if (!Array.isArray(value)) return undefined;
  return value
    .filter(
      (item) =>
        isRecord(item) &&
        typeof item.pageNumber === 'number' &&
        Number.isInteger(item.pageNumber) &&
        item.pageNumber > 0 &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0
    )
    .map((item) => ({
      pageNumber: item.pageNumber as number,
      text: String(item.text),
      confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    }));
}
function requiredStringArray(body: unknown, key: string): string[] {
  const value = isRecord(body) ? body[key] : undefined;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Missing required string array field: ${key}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return value.map((item) => item.trim());
}
function requiredNumber(body: unknown, key: string): number {
  const value = numberField(body, key);
  if (value === undefined) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Missing required numeric field: ${key}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return value;
}

function numberField(body: unknown, key: string): number | undefined {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanField(body: unknown, key: string): boolean | undefined {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}
function requiredString(body: unknown, key: string): string {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Missing required field: ${key}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return value;
}

function stringField(body: unknown, key: string): string | undefined {
  const value = isRecord(body) ? body[key] : undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function requiredReviewRating(body: unknown): LegalStudyReviewRating {
  const rating = requiredString(body, 'rating');
  if (rating !== 'again' && rating !== 'hard' && rating !== 'good' && rating !== 'easy') {
    throw new AppError(
      'VALIDATION_ERROR',
      'rating must be again, hard, good, or easy',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return rating;
}
function requiredDecision(body: unknown): Exclude<LegalStudyProposalDecision, 'pending'> {
  const decision = requiredString(body, 'decision');
  if (
    decision !== 'accepted' &&
    decision !== 'modified' &&
    decision !== 'rejected' &&
    decision !== 'undone'
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'decision must be accepted, modified, rejected, or undone',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return decision;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sanitizeUploadFileName(value: string): string {
  const normalized = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  if (!normalized) {
    throw new AppError('VALIDATION_ERROR', 'fileName cannot be empty.', HTTP_STATUS.BAD_REQUEST);
  }
  if (!/\.(pdf|png|jpg|jpeg)$/i.test(normalized)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only PDF, PNG, JPG, and JPEG files are supported.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return normalized;
}
export default router;
function agentInsightStatus(): {
  enabled: boolean;
  provider: string;
  model: string;
  healthy: boolean;
  warning?: string;
} {
  const enabled = process.env.LEGAL_STUDY_AGENT_INSIGHT_PROVIDER === 'deepseek';
  const configured = Boolean(process.env.DEEPSEEK_API_KEY);
  return {
    enabled,
    provider: enabled ? 'deepseek' : 'deterministic-rule-explanation',
    model: process.env.DEEPSEEK_AGENT_MODEL || process.env.DEEPSEEK_CARD_MODEL || 'deepseek-chat',
    healthy: enabled ? configured : true,
    warning:
      enabled && !configured
        ? 'LEGAL_STUDY_AGENT_INSIGHT_PROVIDER=deepseek but DEEPSEEK_API_KEY is not configured; falling back to deterministic explanation.'
        : undefined,
  };
}

function deepSeekStatus(): {
  configured: boolean;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
} {
  return {
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_CARD_MODEL || 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  };
}

async function legalStudyProviderHealth(): Promise<{
  ocr: {
    configured: boolean;
    endpoint: string;
    healthUrl: string;
    healthy: boolean;
    warning?: string;
  };
  deepseek: ReturnType<typeof deepSeekStatus> & { healthy: boolean; warning?: string };
  agentInsight: ReturnType<typeof agentInsightStatus>;
  bilibili: {
    provider: string;
    endpoint: string;
    timeoutMs: number;
    realParsingEnabled: boolean;
    manualFallbacks: string[];
    warning?: string;
  };
}> {
  const ocrEndpoint = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8765/ocr';
  const ocrHealthUrl = siblingHealthUrl(ocrEndpoint);
  const ocrHealthy = await probeHttp(
    ocrHealthUrl,
    Number(process.env.OCR_HEALTH_TIMEOUT_MS ?? 3000)
  );
  const deepseek = deepSeekStatus();
  const realParsingEnabled = process.env.BILIBILI_PROVIDER === 'real';
  return {
    ocr: {
      configured: Boolean(ocrEndpoint),
      endpoint: ocrEndpoint,
      healthUrl: ocrHealthUrl,
      healthy: ocrHealthy.ok,
      warning: ocrEndpoint.endsWith('/ocr')
        ? ocrHealthy.warning
        : `OCR_SERVICE_URL should point to the POST endpoint, usually ${trimTrailingSlash(ocrEndpoint)}/ocr.`,
    },
    deepseek: {
      ...deepseek,
      healthy: deepseek.configured,
      warning: deepseek.configured
        ? undefined
        : 'DEEPSEEK_API_KEY is not configured; card generation will fall back when allowed.',
    },
    agentInsight: agentInsightStatus(),
    bilibili: {
      provider: realParsingEnabled ? 'real-public-metadata' : 'mock-provider',
      endpoint:
        process.env.BILIBILI_VIEW_API_URL || 'https://api.bilibili.com/x/web-interface/view',
      timeoutMs: Number(process.env.BILIBILI_REQUEST_TIMEOUT_MS ?? 10000),
      realParsingEnabled,
      manualFallbacks: ['manual-entry', 'paste-episode-json', 'upload-course-catalog-json'],
      warning: realParsingEnabled
        ? 'Real parsing depends on Bilibili public metadata availability; frontend and API support manual fallback.'
        : 'Set BILIBILI_PROVIDER=real to enable public metadata parsing.',
    },
  };
}

async function probeHttp(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; warning?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return response.ok
      ? { ok: true }
      : { ok: false, warning: `${url} returned HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, warning: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function siblingHealthUrl(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.pathname = '/health';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'http://127.0.0.1:8765/health';
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
function toolStatusCode(status: string): number {
  if (status === 'completed') return HTTP_STATUS.OK;
  if (status === 'human_review_required') return HTTP_STATUS.ACCEPTED;
  if (status === 'denied') return HTTP_STATUS.FORBIDDEN;
  return HTTP_STATUS.BAD_REQUEST;
}
