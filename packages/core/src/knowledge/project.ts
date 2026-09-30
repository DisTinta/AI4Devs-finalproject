/** Languages an indexed project can be written in (Postgres enum `project_language`). */
export const PROJECT_LANGUAGES = ['php', 'typescript'] as const;

/** Language of an indexed project. */
export type ProjectLanguage = (typeof PROJECT_LANGUAGES)[number];

/** Frameworks the analyzers recognise (Postgres enum `project_framework`). */
export const PROJECT_FRAMEWORKS = ['laravel', 'fastify', 'none'] as const;

/** Framework of an indexed project. */
export type ProjectFramework = (typeof PROJECT_FRAMEWORKS)[number];

/**
 * What the domain supplies to create a project. `framework` is fixed here: saving a graph never
 * changes it, nor any other attribute below.
 */
export interface NewProject {
  /** Unique project name. */
  name: string;
  /** Root path of the repository on disk. */
  rootPath: string;
  /** Language, which selects the analyzer. */
  language: ProjectLanguage;
  /** Detected framework; unset when unknown. */
  framework?: ProjectFramework;
  /** Whether it is a sample repository loaded by the seed. Defaults to `false`. */
  isSample?: boolean;
}

/** A stored project, as the store reads it back. */
export interface Project {
  /** Project id (UUID). */
  id: string;
  /** Unique project name. */
  name: string;
  /** Root path of the repository on disk. */
  rootPath: string;
  /** Language, which selects the analyzer. */
  language: ProjectLanguage;
  /** Detected framework; unset when unknown. */
  framework?: ProjectFramework;
  /** Whether it is a sample repository loaded by the seed. */
  isSample: boolean;
  /** Commit of the last saved snapshot; unset while unindexed or when the snapshot declared none. */
  indexedCommit?: string;
  /** When the last snapshot was saved; unset while unindexed. */
  indexedAt?: Date;
  /** Files plus symbols of the last snapshot; 0 while unindexed. */
  nodeCount: number;
  /** Edges of the last snapshot; 0 while unindexed. */
  edgeCount: number;
  /** When the project was created. */
  createdAt: Date;
}
