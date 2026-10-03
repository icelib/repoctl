import type { GetWorkspacePackagesOptions } from '../types'
import type { AgenticTemplateFormat, AgenticTemplateTask, GenerateAgenticTemplateOptions } from './ai'
import type { RecommendedCheckMode, RecommendedCheckOptions, RecommendedCheckPlan, RecommendedCheckPlanCommand } from './check'
import type { ConfigInspection } from './config'
import type { CreateNewProjectOptions, CreateNewProjectPlan } from './create'
import type { DoctorCheck, DoctorReport, DoctorStatus, DoctorSummary } from './doctor'
import type { EnvInfo, EnvPathEntry, EnvPaths, EnvSnapshot, EnvSupportBundle } from './env'
import type { EnsurePullRequestOptions, EnsureReleaseOptions, EnsureTagOptions, GitHubClientOptions, GitHubOperations } from './release'
import type { SkillTarget, SyncSkillsOptions } from './skills'
import type { CheckTemplatesOptions, TemplateHealthCheck, TemplateHealthReport, TemplateHealthStatus, TemplateHealthSummary } from './templates'
import type { CommitMsgVerifyOptions, PreCommitVerifyOptions, PrePushVerifyOptions, StagedTypecheckOptions, VerifyCommandOptions } from './verify'
import { GitClient } from '../core/git'
import { getWorkspaceData, getWorkspacePackages } from '../core/workspace'
import { createTimestampFolderName, defaultAgenticBaseDir, generateAgenticTemplate, generateAgenticTemplates, loadAgenticTasks } from './ai'
import { getKnownRepoCheckCommands, resolveFullWorkspaceCheckPlan, resolveRecommendedCheckPlan, runRecommendedCheck } from './check'
import { cleanProjects } from './clean'
import { inspectMonorepoConfig } from './config'
import { createNewProject, getCreateChoices, getTemplateMap, resolveCreateNewProjectPlan, templateMap } from './create'
import { runDoctor } from './doctor'
import { collectEnvInfo, collectEnvPaths, collectEnvSnapshot, collectEnvSupportBundle } from './env'
import { init, initMetadata, initTooling, initToolingTargets, normalizeInitToolingTargets } from './init'
import { setVscodeBinaryMirror } from './mirror'
import { createReleasePullRequest, enterPrerelease, exitPrerelease, GitHubApiError, GitHubClient, parsePublishSummary, prepareStable, publishStable, reconcileRelease, recoverUnpublished, releaseCi, releasePrerelease, releaseStable, repairReleaseNotes } from './release'
import { getSkillTargetPaths, skillTargets, syncSkills } from './skills'
import { checkTemplates } from './templates'
import { upgradeMonorepo } from './upgrade'
import { verifyCommitMsg, verifyPreCommit, verifyPrePush, verifyStagedTypecheck } from './verify'

export type {
  AgenticTemplateFormat,
  AgenticTemplateTask,
  CheckTemplatesOptions,
  CommitMsgVerifyOptions,
  ConfigInspection,
  CreateNewProjectOptions,
  CreateNewProjectPlan,
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
  SkillTarget,
  StagedTypecheckOptions,
  SyncSkillsOptions,
  TemplateHealthCheck,
  TemplateHealthReport,
  TemplateHealthStatus,
  TemplateHealthSummary,
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
  inspectMonorepoConfig,
  loadAgenticTasks,
  normalizeInitToolingTargets,
  parsePublishSummary,
  prepareStable,
  publishStable,
  reconcileRelease,
  recoverUnpublished,
  releaseCi,
  releasePrerelease,
  releaseStable,
  repairReleaseNotes,
  resolveCreateNewProjectPlan,
  resolveFullWorkspaceCheckPlan,
  resolveRecommendedCheckPlan,
  runDoctor,
  runRecommendedCheck,
  setVscodeBinaryMirror,
  skillTargets,
  syncSkills,
  templateMap,
  upgradeMonorepo,
  verifyCommitMsg,
  verifyPreCommit,
  verifyPrePush,
  verifyStagedTypecheck,
}

export { resolveAffectedCheckPlan } from './check/affected'
export type { AffectedCheckCommand, AffectedCheckOptions, AffectedCheckPlan, AffectedCheckSettings, AffectedFallback, AffectedFile, AffectedGitRange, AffectedPackage } from './check/affected'
export { analyzeTurboRuns } from './check/cache'
export type { TurboAnalysisLimitation, TurboAnalysisOptions, TurboCriticalPath, TurboHashEvidence, TurboRunAnalysis, TurboTaskAnalysis } from './check/cache'
export { runCheckWithReport } from './check/execute'
export { getKnipConfigurationSuggestions, planKnipCheck, runKnipCheck, saveKnipBaseline } from './check/knip'
export { resolveAffectedCheckMatrix } from './check/matrix'
export type { AffectedCheckMatrix, AffectedCheckMatrixJob, AffectedCheckMatrixOptions } from './check/matrix'

export type { CheckExecutionOptions, CheckExecutionReport, CheckExecutionStatus, CheckExecutionTask } from './check/types'
export { applyDependencyFixPlan, checkDependencies, planDependencyFix } from './deps'
export { checkDependencyAdmission } from './deps/admission'
export type { AdmissionDeclaration, DependencyAdmissionConfig, DependencyAdmissionException, DependencyAdmissionFinding, DependencyAdmissionOptions, DependencyAdmissionReport, DependencyAdmissionRule } from './deps/admission'
export { checkPeerDependencies } from './deps/peers'
export type { PeerCheckStatus, PeerCompatibilityCheck, PeerCompatibilityReport } from './deps/peers'
export { checkEnvironmentCache } from './env-cache'

export type * from './env-cache'
export { formatEnvironmentCache } from './env-cache/format'
export { checkPackages } from './package-check'
export type { PackageCheckCommand, PackageCheckDiagnostic, PackageCheckOptions, PackageCheckReport, PackageCheckResult } from './package-check'
export { applyProjectReferencesPlan, checkProjectReferences, planProjectReferences, syncProjectReferences } from './project-references'
export type { GitHubRelease, ReleaseCiOptions, ReleaseLifecycleState, ReleaseStateSnapshot, ReleaseTarget } from './release'
export { resolveReleaseBranches } from './release/lines'

export type { ReleaseBranchesConfig, ReleaseBranchRule } from './release/lines'
export { createReleasePlan } from './release/plan'

export type { ReleasePlan, ReleasePlanOptions, ReleasePlanPackage } from './release/plan'
export * from './template-instances'

export { applyToolingCapability, listToolingCapabilities, planToolingCapability } from './tooling-capabilities'
export type { PlaywrightCapabilityOptions, PlaywrightInteraction, StorybookArgs, StorybookCapabilityOptions, ToolingCapability, ToolingCapabilityFile, ToolingCapabilityOptions, ToolingCapabilityPlan, ToolingCapabilityResult } from './tooling-capabilities'
export { applyUpgradePlan, formatUpgradePlan, planUpgrade } from './upgrade'
