import type {
  LegalStudyCourse,
  LegalStudyCoursePressure,
  LegalStudyLearningSnapshot,
} from '../types';

export function computeCoursePressure(
  snapshot: LegalStudyLearningSnapshot,
  date: string
): LegalStudyCoursePressure[] {
  return snapshot.courses
    .map((course) => pressureForCourse(snapshot, course, date))
    .sort((left, right) => {
      const riskDelta = riskRank(right.risk) - riskRank(left.risk);
      if (riskDelta !== 0) return riskDelta;
      return right.requiredDailyMinutes - left.requiredDailyMinutes;
    });
}

function pressureForCourse(
  snapshot: LegalStudyLearningSnapshot,
  course: LegalStudyCourse,
  date: string
): LegalStudyCoursePressure {
  const remainingEpisodes = snapshot.episodes.filter(
    (episode) => episode.courseId === course.id && episode.status !== 'completed'
  );
  const remainingMinutes = remainingEpisodes.reduce(
    (sum, episode) => sum + episode.durationMinutes,
    0
  );
  const daysUntilDeadline = Math.max(
    1,
    Math.ceil((Date.parse(`${course.deadline}T23:59:59.999Z`) - Date.parse(`${date}T00:00:00.000Z`)) / 86400000)
  );
  const requiredDailyMinutes = Math.ceil(remainingMinutes / daysUntilDeadline);
  return {
    courseId: course.id,
    subjectId: course.subjectId,
    remainingEpisodeCount: remainingEpisodes.length,
    remainingMinutes,
    daysUntilDeadline,
    requiredDailyMinutes,
    risk: riskFromRequiredMinutes(requiredDailyMinutes, snapshot.availableMinutesToday),
  };
}

function riskFromRequiredMinutes(requiredDailyMinutes: number, availableMinutes: number): LegalStudyCoursePressure['risk'] {
  const ratio = availableMinutes > 0 ? requiredDailyMinutes / availableMinutes : 1;
  if (ratio >= 0.6) return 'critical';
  if (ratio >= 0.4) return 'high';
  if (ratio >= 0.2) return 'medium';
  return 'low';
}

function riskRank(risk: LegalStudyCoursePressure['risk']): number {
  switch (risk) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
  return 0;
}
