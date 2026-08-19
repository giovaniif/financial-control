import type {
  ApplyImportRequest,
  ImportReportResponse,
  SpreadsheetReading,
} from '@fin/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api';

export interface ReadRequest {
  file: File;
  /** Overrides the year the reading inferred for the leftmost column. */
  firstColumnYear?: number;
}

/**
 * UC-1.7 — reads the workbook and returns what it holds. Writes nothing, so
 * the user can back out of the review with the database untouched.
 */
export function useReadSpreadsheet() {
  return useMutation({
    mutationFn: ({ file, firstColumnYear }: ReadRequest) => {
      const body = new FormData();
      body.append('file', file);
      const query =
        firstColumnYear === undefined
          ? ''
          : `?firstColumnYear=${String(firstColumnYear)}`;

      return api<SpreadsheetReading>(`/import/spreadsheet${query}`, {
        method: 'POST',
        body,
      });
    },
  });
}

/** The reading plus everything the sheet could not say. This one writes. */
export function useApplyImport() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (request: ApplyImportRequest) =>
      api<ImportReportResponse>('/import/spreadsheet/apply', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    onSuccess: async () => {
      // The import replaces the whole dataset.
      await client.invalidateQueries();
    },
  });
}
