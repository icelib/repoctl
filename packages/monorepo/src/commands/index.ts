import type { GetWorkspacePackagesOptions } from '../types'
import type { AgenticTemplateFormat, AgenticTemplateTask, GenerateAgenticTemplateOptions } from './ai'
import type { RecommendedCheckMode, RecommendedCheckOptions, RecommendedCheckPlan, RecommendedCheckPlanCommand } from './check'
import type { ConfigInspection } from './config'
import type { CreateManifestRecoveryResult, CreateNewProjectOptions, CreateNewProjectPlan, CreateTargetInspection, CreateTargetInspectionStatus, CreateTargetMarker, RecoverCreateTargetOptions, RecoverCreateTargetResult } from './create'
import type { DoctorCheck, DoctorReport, DoctorStatus, DoctorSummary } from './doctor'
import type { EnvInfo, EnvPathEntry, EnvPaths, EnvSnapshot, EnvSupportBundle } from './env'
import type { EnsurePullRequestOptions, EnsureReleaseOptions, EnsureTagOptions, GitHubClientOptions, GitHubOperations } from './release'
import type { SkillTarget, SyncSkillsOptions } from './skills'
import type { CheckTemplatesOptions, TemplateHealthCheck, TemplateHealthReport, TemplateHealthStatus, TemplateHealthSummary } from './templates'
import type { UpgradeAction, UpgradeDiff, UpgradeFileIdentity, UpgradeJournalOperation, UpgradeLockErrorCode, UpgradeLockInspection, UpgradeLockInspectionState, UpgradeLockOwner, UpgradePlan, UpgradePlanFile, UpgradeTransactionInspection, UpgradeTransactionJournal, UpgradeTransactionLock, UpgradeTransactionState } from './upgrade'
import type { CommitMsgVerifyOptions, PreCommitVerifyOptions, PrePushVerifyOptions, StagedTypecheckOptions, VerifyCommandOptions } from './verify'
import { GitClient } from '../core/git'
import { getWorkspaceData, getWorkspacePackages } from '../core/workspace'
import { createTimestampFolderName, defaultAgenticBaseDir, generateAgenticTemplate, generateAgenticTemplates, loadAgenticTasks } from './ai'
import { getKnownRepoCheckCommands, resolveFullWorkspaceCheckPlan, resolveRecommendedCheckPlan, runRecommendedCheck } from './check'
import { cleanProjects } from './clean'
import { inspectMonorepoConfig } from './config'
import { createNewProject, getCreateChoices, getTemplateMap, inspectCreateTarget, recoverCreateTarget, resolveCreateNewProjectPlan, templateMap } from './create'
import { runDoctor } from './doctor'
import { collectEnvInfo, collectEnvPaths, collectEnvSnapshot, collectEnvSupportBundle } from './env'
import { init, initMetadata, initTooling, initToolingTargets, normalizeInitToolingTargets } from './init'
import { setVscodeBinaryMirror } from './mirror'
import { createReleasePullRequest, enterPrerelease, exitPrerelease, GitHubApiError, GitHubClient, parsePublishSummary, prepareStable, publishStable, reconcileRelease, recoverUnpublished, releaseCi, releasePrerelease, releaseStable, repairReleaseNotes } from './release'
import { getSkillTargetPaths, skillTargets, syncSkills } from './skills'
import { checkTemplates } from './templates'
import { inspectUpgradeLock, inspectUpgradeTransactions, resolveUpgradePlan, UpgradeLockError, upgradeMonorepo } from './upgrade'
import { verifyCommitMsg, verifyPreCommit, verifyPrePush, verifyStagedTypecheck } from './verify'

export type {
  AgenticTemplateFormat,
  AgenticTemplateTask,
  CheckTemplatesOptions,
  CommitMsgVerifyOptions,
  ConfigInspection,
  CreateManifestRecoveryResult,
  CreateNewProjectOptions,
  CreateNewProjectPlan,
  CreateTargetInspection,
  CreateTargetInspectionStatus,
  CreateTargetMarker,
  DoctorCheck,
  DoctorReport,
  DoctorStatus,
  DoctorSummary,
  EnsurePullRequestOptions,
  EnsureReleaseOptions,
  EnsureTagOptions,
  EnvInfo,
  EnvPathEntry,
  EnvPaths,
  EnvSnapshot,
  EnvSupportBundle,
  GenerateAgenticTemplateOptions,
  GetWorkspacePackagesOptions,
  GitHubClientOptions,
  GitHubOperations,
  PreCommitVerifyOptions,
  PrePushVerifyOptions,
  RecommendedCheckMode,
  RecommendedCheckOptions,
  RecommendedCheckPlan,
  RecommendedCheckPlanCommand,
  RecoverCreateTargetOptions,
  RecoverCreateTargetResult,
  SkillTarget,
  StagedTypecheckOptions,
  SyncSkillsOptions,
  TemplateHealthCheck,
  TemplateHealthReport,
  TemplateHealthStatus,
  TemplateHealthSummary,
  UpgradeAction,
  UpgradeDiff,
  UpgradeFileIdentity,
  UpgradeJournalOperation,
  UpgradeLockErrorCode,
  UpgradeLockInspection,
  UpgradeLockInspectionState,
  UpgradeLockOwner,
  UpgradePlan,
  UpgradePlanFile,
  UpgradeTransactionInspection,
  UpgradeTransactionJournal,
  UpgradeTransactionLock,
  UpgradeTransactionState,
  VerifyCommandOptions,
}

export {
  checkTemplates,
  cleanProjects,
  collectEnvInfo,
  collectEnvPaths,
  collectEnvSnapshot,
  collectEnvSupportBundle,
  createNewProject,
  createReleasePullRequest,
  createTimestampFolderName,
  defaultAgenticBaseDir,
  enterPrerelease,
  exitPrerelease,
  generateAgenticTemplate,
  generateAgenticTemplates,
  getCreateChoices,
  getKnownRepoCheckCommands,
  getSkillTargetPaths,
  getTemplateMap,
  getWorkspaceData,
  getWorkspacePackages,
  GitClient,
  GitHubApiError,
  GitHubClient,
  init,
  initMetadata,
  initTooling,
  initToolingTargets,
  inspectCreateTarget,
  inspectMonorepoConfig,
  inspectUpgradeLock,
  inspectUpgradeTransactions,
  loadAgenticTasks,
  normalizeInitToolingTargets,
  parsePublishSummary,
  prepareStable,
  publishStable,
  reconcileRelease,
  recoverCreateTarget,
  recoverUnpublished,
  releaseCi,
  releasePrerelease,
  releaseStable,
  repairReleaseNotes,
  resolveCreateNewProjectPlan,
  resolveFullWorkspaceCheckPlan,
  resolveRecommendedCheckPlan,
  resolveUpgradePlan,
  runDoctor,
  runRecommendedCheck,
  setVscodeBinaryMirror,
  skillTargets,
  syncSkills,
  templateMap,
  UpgradeLockError,
  upgradeMonorepo,
  verifyCommitMsg,
  verifyPreCommit,
  verifyPrePush,
  verifyStagedTypecheck,
}
