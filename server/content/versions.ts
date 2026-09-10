import { contentHash } from './draft.js';
import type {
  ArticleValidationReport,
  ContentProductionJob,
  ProductionVersion,
  VersionAction
} from './types.js';

/**
 * Appends a version. Existing versions are never mutated or removed, so the
 * history is always a complete audit trail of the article.
 */
export function appendVersion(
  job: ContentProductionJob,
  params: {
    action: VersionAction;
    source: ProductionVersion['source'];
    title: string;
    content: string;
    excerpt?: string;
    metaDescription?: string;
    briefVersion?: number;
    validation?: ArticleValidationReport;
    userNotes?: string;
  }
): ProductionVersion {
  const nextNumber = job.versions.reduce((max, version) => Math.max(max, version.version), 0) + 1;
  const version: ProductionVersion = {
    version: nextNumber,
    timestamp: new Date().toISOString(),
    action: params.action,
    source: params.source,
    contentHash: contentHash(params.content),
    title: params.title,
    content: params.content,
    excerpt: params.excerpt,
    metaDescription: params.metaDescription,
    briefVersion: params.briefVersion,
    validation: params.validation,
    userNotes: params.userNotes
  };
  job.versions = [...job.versions, version];
  return version;
}

export function getVersion(job: ContentProductionJob, versionNumber: number): ProductionVersion | undefined {
  return job.versions.find((version) => version.version === versionNumber);
}

/**
 * Restoring rolls the draft back to an older version but records the restore
 * as a new version, so nothing is destroyed.
 */
export function restoreVersion(
  job: ContentProductionJob,
  versionNumber: number,
  userNotes?: string
): { job: ContentProductionJob; restored: ProductionVersion } | null {
  const target = getVersion(job, versionNumber);
  if (!target || !job.draft) return null;

  const restored = appendVersion(job, {
    action: 'RESTORED',
    source: 'user',
    title: target.title,
    content: target.content,
    excerpt: target.excerpt,
    metaDescription: target.metaDescription,
    briefVersion: target.briefVersion,
    userNotes: userNotes || `بازگردانی از نسخهٔ ${versionNumber}`
  });

  job.draft = {
    ...job.draft,
    title: target.title,
    content: target.content,
    excerpt: target.excerpt || job.draft.excerpt,
    metaDescription: target.metaDescription || job.draft.metaDescription,
    contentHash: restored.contentHash,
    version: restored.version,
    source: 'user_edited'
  };

  // Reports were computed against the previous content and no longer apply.
  job.validation = undefined;
  job.factCheck = undefined;
  job.seoPreflight = undefined;
  job.publishingChecklist = undefined;
  job.stage = 'needs_revision';

  return { job, restored };
}
