import { describe, expect, it } from 'vitest';
import { DomainError, EmptyRepository, InvalidStoreQuery, NotAGitRepository, ProjectNameTaken, ProjectNotFound } from '@codemind/core';

// The codes are the stable contract a transport maps (design D1); messages name the offending value.
describe('domain errors', () => {
  it('ProjectNotFound carries its stable code and the id', () => {
    // Arrange / Act
    const error = new ProjectNotFound('00000000-0000-0000-0000-000000000000');

    // Assert
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PROJECT_NOT_FOUND');
    expect(error.name).toBe('ProjectNotFound');
    expect(error.projectId).toBe('00000000-0000-0000-0000-000000000000');
    expect(error.message).toBe('Project not found: 00000000-0000-0000-0000-000000000000');
  });

  it('ProjectNameTaken carries its stable code and the name', () => {
    // Arrange / Act
    const error = new ProjectNameTaken('sample-project');

    // Assert
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PROJECT_NAME_TAKEN');
    expect(error.name).toBe('ProjectNameTaken');
    expect(error.projectName).toBe('sample-project');
    expect(error.message).toBe('Project name already taken: sample-project');
  });

  it('InvalidStoreQuery carries its stable code and the argument', () => {
    // Arrange / Act
    const error = new InvalidStoreQuery('hops', 'must be an integer from 1 to 3 (got 4)');

    // Assert
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INVALID_STORE_QUERY');
    expect(error.name).toBe('InvalidStoreQuery');
    expect(error.argument).toBe('hops');
    expect(error.message).toBe('Invalid store query: hops must be an integer from 1 to 3 (got 4)');
  });

  it('NotAGitRepository carries its stable code and the path', () => {
    // Arrange / Act
    const error = new NotAGitRepository('/tmp/not-a-repo');

    // Assert
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('NOT_A_GIT_REPOSITORY');
    expect(error.name).toBe('NotAGitRepository');
    expect(error.repoPath).toBe('/tmp/not-a-repo');
    expect(error.message).toBe('Not a Git repository: /tmp/not-a-repo');
  });

  it('EmptyRepository carries its stable code and the path, and means no commit', () => {
    // Arrange / Act
    const error = new EmptyRepository('/tmp/fresh-repo');

    // Assert
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('EMPTY_REPOSITORY');
    expect(error.name).toBe('EmptyRepository');
    expect(error.repoPath).toBe('/tmp/fresh-repo');
    expect(error.message).toBe('Git repository has no commit: /tmp/fresh-repo');
  });
});
