# Engine results (aggregate only; regenerate with `python -m engine.ablation` and `python -m engine.error_analysis`)

Headline (Mark's request): **new full systems**, planner answered 'Solar already on the roof?'. Add-on sales (battery retrofits, PV extensions, wallbox-only) are reported separately in engine/README.md (segment add_ons).

## Before/after per improvement (locked test set)

315 held-out projects (engine/artifacts/test_ids.json, grouped by customer), truth = engine/labels.

## all projects

| metric | A  before #1 (no offer type, 450 W modules) | B  + #1 offer type + existing-PV input | C  + #3 installer packages | D  + #5 calibration (shipped) | #4 before: interim labels + raw inputs | best baseline: band median |
|---|---|---|---|---|---|---|
| PV kWp MAE, all projects | 2.99 | 2.93 | 2.94 | 2.94 | 2.90 | 3.77 |
| PV kWp MAE, size only | 2.47 | 2.47 | 2.48 | 2.48 | 2.49 | 2.64 |
| PV within ±1.5 kWp | 39 % | 40 % | 40 % | 40 % | 39 % | 43 % |
| PV exact match | 5 % | 5 % | 9 % | 9 % | 10 % | 9 % |
| PV in expert variants ±1 kWp | 41 % | 42 % | 42 % | 42 % | 43 % | 30 % |
| battery kWh MAE, size only | 2.53 | 2.52 | 2.52 | 2.50 | 2.46 | 2.71 |
| battery within 1 step | 55 % | 51 % | 50 % | 51 % | 51 % | 51 % |
| PV yes/no | 87 % | 88 % | 88 % | 88 % | 88 % | 82 % |
| battery yes/no | 90 % | 87 % | 87 % | 88 % | 87 % | 90 % |
| offer type | 83 % | 82 % | 82 % | 83 % | 82 % | 82 % |
| P10–P90 contains expert PV (target 80 %) | 75 % | 75 % | 75 % | 80 % | 81 % | 9 % |

## full designs (answered)

| metric | A  before #1 (no offer type, 450 W modules) | B  + #1 offer type + existing-PV input | C  + #3 installer packages | D  + #5 calibration (shipped) | #4 before: interim labels + raw inputs | best baseline: band median |
|---|---|---|---|---|---|---|
| PV kWp MAE, all projects | 3.10 | 2.48 | 2.49 | 2.49 | 2.50 | 2.62 |
| PV kWp MAE, size only | 2.44 | 2.48 | 2.49 | 2.49 | 2.50 | 2.62 |
| PV within ±1.5 kWp | 40 % | 45 % | 45 % | 45 % | 44 % | 43 % |
| PV exact match | 5 % | 6 % | 9 % | 9 % | 10 % | 9 % |
| PV in expert variants ±1 kWp | 34 % | 38 % | 37 % | 37 % | 38 % | 37 % |
| battery kWh MAE, size only | 2.81 | 2.71 | 2.69 | 2.69 | 2.63 | 2.97 |
| battery within 1 step | 50 % | 48 % | 49 % | 49 % | 48 % | 46 % |
| PV yes/no | 90 % | 100 % | 100 % | 100 % | 100 % | 100 % |
| battery yes/no | 95 % | 95 % | 95 % | 95 % | 95 % | 95 % |
| offer type | 90 % | 100 % | 100 % | 100 % | 100 % | 100 % |
| P10–P90 contains expert PV (target 80 %) | 75 % | 74 % | 74 % | 79 % | 81 % | 9 % |

## full + real consumption (answered)

| metric | A  before #1 (no offer type, 450 W modules) | B  + #1 offer type + existing-PV input | C  + #3 installer packages | D  + #5 calibration (shipped) | #4 before: interim labels + raw inputs | best baseline: band median |
|---|---|---|---|---|---|---|
| PV kWp MAE, all projects | 2.37 | 2.37 | 2.38 | 2.38 | 2.37 | 2.49 |
| PV kWp MAE, size only | 2.36 | 2.37 | 2.38 | 2.38 | 2.37 | 2.49 |
| PV within ±1.5 kWp | 43 % | 45 % | 44 % | 44 % | 43 % | 44 % |
| PV exact match | 4 % | 4 % | 7 % | 7 % | 9 % | 8 % |
| PV in expert variants ±1 kWp | 36 % | 36 % | 36 % | 36 % | 37 % | 39 % |
| battery kWh MAE, size only | 2.65 | 2.64 | 2.62 | 2.62 | 2.53 | 2.77 |
| battery within 1 step | 52 % | 50 % | 50 % | 50 % | 51 % | 45 % |
| PV yes/no | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % |
| battery yes/no | 96 % | 96 % | 96 % | 96 % | 96 % | 96 % |
| offer type | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % |
| P10–P90 contains expert PV (target 80 %) | 75 % | 75 % | 75 % | 80 % | 81 % | 8 % |


## Error analysis (locked test set, shipped model)

## Mode: not answered

### by installer

| installer   |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| 23c108b7    |  67 |         94.03 |            2.68 |            -1.03 |              98.51 |                  2.6 |             79.37 |
| 2a8ba8e2    | 248 |         85.89 |            2.4  |            -0.51 |              83.47 |                  2.5 |             73.05 |

### by true_group

| true_group       |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:-----------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| battery_retrofit |  41 |         82.93 |          nan    |           nan    |              80.49 |                 0.79 |            nan    |
| other            |   5 |         80    |          nan    |           nan    |              40    |               nan    |            nan    |
| pv               | 257 |         89.49 |            2.48 |            -0.65 |              91.05 |                 2.77 |             74.78 |
| wallbox_only     |  12 |         66.67 |          nan    |           nan    |              33.33 |               nan    |            nan    |

### by band

| band   |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:-------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| <3k    |  54 |         98.15 |            2.25 |            -0.91 |              98.15 |                 2.17 |             77.36 |
| 3-4.5k | 166 |         80.72 |            2.22 |            -0.44 |              78.92 |                 2.33 |             77.53 |
| 4.5-6k |  36 |         97.22 |            2.52 |             0.03 |             100    |                 1.85 |             65.71 |
| 6-9k   |  39 |         97.44 |            2.61 |            -1.13 |              92.31 |                 3.37 |             75.68 |
| >9k    |  15 |        100    |            3.4  |            -0.26 |             100    |                 5    |             73.33 |

### by demand_is_default

| demand_is_default   |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:--------------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| False               | 217 |         96.31 |            2.47 |            -0.7  |              94.01 |                 2.6  |             73.91 |
| True                |  98 |         68.37 |            2.54 |            -0.19 |              70.41 |                 2.28 |             82.61 |

### by pv_source

| pv_source     |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:--------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| module_lines  |   9 |        100    |            3.49 |            -0.01 |             100    |                 2.53 |             55.56 |
| none          |  58 |         79.31 |          nan    |           nan    |              67.24 |                 0.79 |            nan    |
| package_name  |  41 |         95.12 |            1.94 |             0.16 |              97.56 |                 2.02 |             84.62 |
| roof_mounting |  24 |        100    |            3.38 |            -2.17 |              95.83 |                 3.79 |             70.83 |
| substructure  | 183 |         86.34 |            2.42 |            -0.66 |              88.52 |                 2.82 |             74.05 |

### offer type: true (rows) vs predicted (columns)

| true_group       |   battery_retrofit |   other |   pv |   wallbox_only |
|:-----------------|-------------------:|--------:|-----:|---------------:|
| battery_retrofit |                 26 |       0 |    7 |              8 |
| other            |                  2 |       0 |    1 |              2 |
| pv               |                 15 |       1 |  230 |             11 |
| wallbox_only     |                  4 |       1 |    4 |              3 |


## Mode: planner answered 'PV already on the roof?'

### by installer

| installer   |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| 23c108b7    |  67 |         95.52 |            2.68 |            -1.03 |              98.51 |                 2.59 |             79.37 |
| 2a8ba8e2    | 248 |         96.77 |            2.46 |            -0.53 |              89.92 |                 2.35 |             71.88 |

### by true_group

| true_group       |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:-----------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| battery_retrofit |  41 |         90.24 |          nan    |           nan    |             100    |                 0.85 |            nan    |
| other            |   5 |         80    |          nan    |           nan    |              40    |               nan    |            nan    |
| pv               | 257 |         99.22 |            2.52 |            -0.65 |              94.16 |                 2.67 |             73.73 |
| wallbox_only     |  12 |         66.67 |          nan    |           nan    |              33.33 |               nan    |            nan    |

### by band

| band   |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:-------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| <3k    |  54 |         98.15 |            2.25 |            -0.91 |              98.15 |                 2.17 |             77.36 |
| 3-4.5k | 166 |         96.39 |            2.36 |            -0.49 |              88.55 |                 2.15 |             74.56 |
| 4.5-6k |  36 |         97.22 |            2.52 |             0.03 |             100    |                 1.85 |             65.71 |
| 6-9k   |  39 |         97.44 |            2.61 |            -1.13 |              92.31 |                 3.37 |             75.68 |
| >9k    |  15 |        100    |            3.4  |            -0.26 |             100    |                 5    |             73.33 |

### by demand_is_default

| demand_is_default   |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:--------------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| False               | 217 |         97.24 |            2.47 |            -0.7  |              94.01 |                 2.57 |             73.91 |
| True                |  98 |         94.9  |            2.71 |            -0.43 |              86.73 |                 1.98 |             72.92 |

### by pv_source

| pv_source     |   n |   PV yes/no % |   PV MAE (both) |   PV bias (both) |   battery yes/no % |   battery MAE (both) |   P10-P90 cover % |
|:--------------|----:|--------------:|----------------:|-----------------:|-------------------:|---------------------:|------------------:|
| module_lines  |   9 |        100    |            3.49 |            -0.01 |             100    |                 2.53 |             55.56 |
| none          |  58 |         84.48 |          nan    |           nan    |              81.03 |                 0.85 |            nan    |
| package_name  |  41 |        100    |            2.04 |            -0.04 |              95.12 |                 1.97 |             82.93 |
| roof_mounting |  24 |        100    |            3.38 |            -2.17 |              95.83 |                 3.8  |             70.83 |
| substructure  | 183 |         98.91 |            2.46 |            -0.62 |              93.44 |                 2.68 |             72.93 |

### offer type: true (rows) vs predicted (columns)

| true_group       |   battery_retrofit |   other |   pv |   wallbox_only |
|:-----------------|-------------------:|--------:|-----:|---------------:|
| battery_retrofit |                 37 |       0 |    4 |              0 |
| other            |                  2 |       0 |    1 |              2 |
| pv               |                  2 |       0 |  255 |              0 |
| wallbox_only     |                  4 |       1 |    4 |              3 |
