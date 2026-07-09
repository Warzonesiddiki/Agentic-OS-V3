# pipeline-io

## Purpose
Serialization + validation of pipelines for the pipeline builder. `PipelineIO` object wraps import/export
of `SerializedPipeline` (nodes/edges/metadata), template resolution, and a `validate(result)` pass that
returns structured `ValidationIssue`s. `PipelineIOInterface` is the shape consumed elsewhere.

## Public exports
- Types: `PipelineMetadata`, `SerializedNode`, `SerializedEdge`, `SerializedPipeline`, `PipelineTemplate`,
  `ValidationIssue`, `ValidationResult`.
- `const PipelineIO` — `{ serialize, deserialize, exportTemplate, importTemplate, validate }`.
- `type PipelineIOInterface = typeof PipelineIO`.

## Env vars
None directly.

## Test file
- `server/tests/pipeline-io.test.ts` (serialize/deserialize round-trip, validate issues).
