# Telemetry Tools Overview

## Introduction
The Custom DTR Telemetry module is a high-performance analytics dashboard designed to visualize daily time records (DTR). Inspired by the precision of Formula 1 telemetry, it transforms subjective time logs into quantitative, actionable insights.

## Core Visualizations
The system features a comprehensive suite of charts to analyze performance from different angles:

1. **Cumulative Progress vs Goal (Trajectory)**
   Tracks overall accumulated hours against a target pace to determine if the user is ahead or behind schedule.

2. **Session Delta**
   A granular view of daily over/under target performance. It highlights consistency and fluctuations in day-to-day workload capacity.

3. **Weekly Delta Momentum (Candlestick)**
   Applies financial candlestick chart concepts to productivity. It visualizes the volatility and momentum of productivity deltas throughout a week.

4. **Performance Matrix (Correlation Bubble Chart)**
   Correlates the subjective *Identity Score* against a calculated *Session Impact* (Accomplishments / Hours) to uncover the relationship between mindset and actual output.

5. **Day-of-Week Velocity (Radar)**
   A radar chart mapping average productivity across different days of the week, helping to identify inherent weekly rhythms or fatigue points.

6. **Identity Alignment**
   Tracks subjective motivation and alignment scores over time to predict burnout or highlight "flow" states.

7. **Energy Zones**
   A categorical distribution chart that buckets daily effort into zones (e.g., Overdrive, Elite, Solid, Survival, Recovery) to monitor workload sustainability and prevent burnout.

8. **Weekly Effort Trend**
   A stacked bar chart comparing standard OJT hours against Personal hours to visualize total weekly capacity.

## Architecture & Data Flow
- **Data Source**: DTR records stored in `localStorage` and `IndexedDB`.
- **Processing Engine**: The TS logic (`telemetry.ts` and `telemetry-charts.ts`) extracts, normalizes, and groups the raw records by date, week, and session type.
- **Rendering**: Uses Chart.js for responsive, canvas-based visualizations with customized color schemes mapping to the active DTR theme.
- **Internationalization (i18n)**: Fully integrated with the DTR localization engine, pulling translated strings and formulas dynamically based on the user's selected language.

## Interactivity & UX
- **Scroll & Zoom**: The Session Delta chart supports horizontal scrolling for large datasets.
- **Drill-down**: Elements like Energy Zones are clickable, allowing users to drill down and see the exact dates that contributed to a specific metric.
- **Simulation Mode**: A sandbox mode allows users to inject simulated days to forecast future completion dates and adjust pacing strategies.

## Semester Cutoff Hard Boundary
To guarantee timeline integrity, the system implements a strict semester boundary rule:
- **Session Logging Boundary**: Recording sessions beyond `semesterEndDate` is prevented in both standard entry forms and bulk imports. The date pickers enforce `max = semesterEndDate`.
- **Telemetry Ingestion Cap**: Telemetry processing automatically filters out records past `semesterEndDate`, effectively freezing telemetry calculations once the configured semester concludes.
- **Forecasting & Status**: Forecast completion projections, workdays remaining, and required pacing rates are strictly bounded at the semester end date. If the current date passes this date, telemetry indicates that recording has ceased.

## IndexedDB Archival & Archive Viewer
To prevent accidental data loss during timeline reconfigurations or data resets:
- **Automated Snapshots**: Prior to clearing records, changing timeline start dates, or replacing conflicting dates, active records are automatically snapshot into the IndexedDB `archived_records` store.
- **Manual Snapshots**: Users can snapshot their active records at any time without resetting live state.
- **Multi-Level Archive Viewer**: The Dedicated Archive Viewer allows reviewing snapshots across three granularities:
  - **Daily**: Chronological review of each session's hours, reflection, accomplishments, and tools.
  - **Weekly**: Grouped by OJT Week number showing total hours, average hours/day, and days logged.
  - **Monthly**: Grouped by calendar month showing total hours, session count, and daily averages.
- **Safe Restoration**: Restoring an archived snapshot automatically backs up the active timeline first, ensuring zero risk of irreversible data loss.
