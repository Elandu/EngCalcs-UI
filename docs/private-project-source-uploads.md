# Private engineering source PDFs (backend)

This increment adds private PDF ingestion to EngCalcs project evidence. **It does not run OCR, AI extraction or any engineering calculation.**

## Limits and security

- Bucket: `engineering-project-sources`, **private**.
- Upload: PDF only, up to **10 MiB**. The finalisation service checks the actual PDF magic header and computes SHA-256 from the downloaded bytes.
- Access: current organisation members can read their project's files; only owners, admins and engineers can request upload tokens. Storage RLS checks the project ID encoded in the object path. No direct anonymous read, client update, file replacement or deletion.
- Objects: random path `<projectUuid>/<fileUuid>.pdf`. The original user-supplied filename is never used in the object key.
- Metadata: `engineering_sources` is append-only for authenticated clients; only the JWT-protected Edge Function can insert a stored PDF path and server-calculated SHA-256.
- The signed upload token is path-bound, short-lived (Supabase currently issues tokens valid for two hours) and **must not be logged**.
- Download: signed link is valid for **60 seconds** and should not be forwarded to other people.
- The system does not scan for malware or sanitize PDF embedded content. Do not execute embedded scripts or treat uploaded drawings as instructions. Client-side viewing should occur only in a sandboxed viewer. Pilot ingestion is PDF-only.

## Frontend client workflow

1. Authenticate and select an existing EngCalcs project.
2. `POST /api/projects/:projectId/sources/upload-intent`:

```json
{ "fileName": "A-101-Rev-C.pdf", "contentType": "application/pdf", "byteSize": 125980 }
```

Returns `{ bucket, path, uploadToken, expiresInSeconds, expectedByteSize }`.

3. Upload directly from the browser with the current Supabase client:

```ts
const { error } = await supabase.storage
  .from(bucket)
  .uploadToSignedUrl(path, uploadToken, pdfFile, { contentType: "application/pdf", upsert: false });
if (error) throw error;
```

4. `POST /api/projects/:projectId/sources/upload-complete`:

```json
{
  "path": "<projectUuid>/<fileUuid>.pdf",
  "kind": "drawing",
  "title": "Architectural first floor plan",
  "revisionLabel": "C",
  "reference": "A-101, sheet 2"
}
```

The server invokes `engcalcs-verify-source-upload` with the user's JWT. The service rechecks membership, downloads bytes from the private bucket, validates the PDF header, computes a checksum and creates one immutable `engineering_sources` row. On duplicate completion, the unique storage path returns a conflict. This binds project revision and source location to the file actually uploaded.

5. List metadata using `GET /api/projects/:projectId/sources`. Uploaded sources show `hasUploadedFile`, `storage_byte_size` and `content_sha256`. Reference-only source rows continue to work without files.
6. `GET /api/projects/:projectId/sources/:sourceId/download` returns a short-lived signed PDF download link for authorised project members.

## Deployment order

1. Apply migration `20261010121000_private_project_source_documents.sql` and verify the bucket is private with RLS.
2. Deploy the JWT-protected Edge Function `engcalcs-verify-source-upload`.
3. Release the Next.js API endpoints and type definitions after CI tests, lint, type-check and preview build pass.
4. Verify RLS using engineer, viewer and unrelated-project identities. Do not test with customer documents; use a synthetic PDF.
5. Check source records, hashes and logs. The API never exposes the service secret.

## Deliberate omissions

- Automatic AI input proposals are not active. Future providers will need an explicit engineer opt-in and source-citation contract before any drawing content leaves the private project.
- There is no bulk upload UI in this increment. These are backend endpoints for the future intake interface.
- Abandoned signed uploads may remain as orphan objects; a restricted cleanup job will be required before production-scale use.
- The cryptographic digest verifies bytes at registration time, not the professional validity of the drawing. A revision label is a user-supplied reference, not an endorsement of the design.
