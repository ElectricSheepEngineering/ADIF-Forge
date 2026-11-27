# ADIF Forge

A bulk editor for an amateur radio log stored as ADIF.

## Language

**Log**:
The QSOs being edited, together with the header and the ordered list of fields.
_Avoid_: document, file, workbook

**QSO**:
One contact in a log.
_Avoid_: row, record, entry

**Field**:
A named ADIF value, on a QSO or in the header.
_Avoid_: column, tag, property

**Header**:
The preamble of a log before the first QSO: free text and header fields, ending at the end-of-header marker.
_Avoid_: preamble, file header

**QSO id**:
The identity of a QSO in the open log. It lasts for the editing session and is not stored in the ADIF file.
_Avoid_: row index, record number

**Duplicate**:
A later QSO that shares callsign, band, mode, date, and the hour and minute of start time with an earlier QSO. The earliest QSO in that run is not a duplicate. A QSO with no callsign is not a duplicate.
_Avoid_: dupe

**Scope**:
The QSOs an edit applies to: every QSO, the selected QSOs, or the QSOs the grid is showing.
_Avoid_: target, selection mode

**Search expression**:
Text matched as typed, or a regular expression written as `/pattern/` or `/pattern/i`.
_Avoid_: query, filter string
