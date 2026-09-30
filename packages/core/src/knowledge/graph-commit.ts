/** A commit of the repository history, identified by its sha. */
export interface GraphCommit {
  /** Commit sha; non-empty and unique within a graph. */
  sha: string;
  /** Commit message, as written in the repository. */
  message?: string;
  /** Pseudonymised author; the store never receives a name or an e-mail. */
  authorHash?: string;
  /** When the commit was made. */
  committedAt?: Date;
  /** Pull request number, when known; never negative. */
  prNumber?: number;
}

/** A file touched by a commit, both referenced within the same graph. */
export interface GraphFileCommit {
  /** Path of a file of the graph. */
  file: string;
  /** Sha of a commit of the graph. */
  sha: string;
  /** Lines added to the file by the commit; never negative. */
  linesAdded?: number;
  /** Lines removed from the file by the commit; never negative. */
  linesRemoved?: number;
}
