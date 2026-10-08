# Ølbørs simulation

6600 new-algorithm runs and 1600 legacy runs, each with 6 beers, 10 participants and 200 purchase attempts. Reproducible seeds 1–200.

All prices stayed finite and within bounds. No accepted purchase increased loss beyond the 150 kr budget; inherited debt may already exceed it. Behavioral models are synthetic.

| Scenario | Preset | Mean final balance (kr) | Worst drawdown (kr) | Requotes | Blocked |
| --- | --- | ---: | ---: | ---: | ---: |
| balanced | gentle | 903.84 | 0 | 0 | 0 |
| balanced | standard | 1045.9 | 0 | 0 | 0 |
| balanced | aggressive | 683.21 | -121.44 | 1 | 0 |
| favorite | gentle | 11916.32 | 0 | 0 | 0 |
| favorite | standard | 15264.56 | 0 | 0 | 0 |
| favorite | aggressive | 16483.89 | 0 | 0 | 0 |
| bargain | gentle | 675.02 | -26.06 | 0 | 0 |
| bargain | standard | 931.81 | 0 | 0 | 0 |
| bargain | aggressive | 746.79 | 0 | 0 | 0 |
| mixed-volume | gentle | 872.93 | 0 | 0 | 0 |
| mixed-volume | standard | 1016.6 | -21.2 | 0 | 0 |
| mixed-volume | aggressive | 695.6 | -148.93 | 9 | 0 |
| bulk | gentle | 2996.62 | -136.46 | 5 | 0 |
| bulk | standard | 3441.27 | -145.17 | 1 | 0 |
| bulk | aggressive | 3086.97 | -149.03 | 60 | 0 |
| expensive-stock | gentle | 848.48 | -148.97 | 200 | 0 |
| expensive-stock | standard | 1005.56 | -149.26 | 200 | 0 |
| expensive-stock | aggressive | 510.6 | -149.97 | 200 | 0 |
| impossible-cap | gentle | -144.81 | -148.97 | 200 | 39438 |
| impossible-cap | standard | -144.29 | -149.26 | 200 | 39438 |
| impossible-cap | aggressive | -143.62 | -149.97 | 200 | 39438 |
| historic-debt | gentle | 1154.16 | -650 | 200 | 0 |
| historic-debt | standard | 1257.81 | -650 | 200 | 0 |
| historic-debt | aggressive | 541.45 | -650 | 200 | 0 |
| scheduled-shocks | gentle | 381.77 | -134.68 | 1 | 0 |
| scheduled-shocks | standard | 608.44 | -60.84 | 0 | 0 |
| scheduled-shocks | aggressive | 247.59 | -143.54 | 4 | 0 |
| profit-crashes | gentle | 825.95 | -4.01 | 0 | 0 |
| profit-crashes | standard | 1022.53 | 0 | 0 | 0 |
| profit-crashes | aggressive | 749.8 | -28.24 | 0 | 0 |
| random-shocks | gentle | 849.42 | -135.66 | 0 | 0 |
| random-shocks | standard | 1014.45 | -43.4 | 0 | 0 |
| random-shocks | aggressive | 725.11 | -148.04 | 8 | 0 |

Historic debt starts at -650 kr. Impossible-cap has a max price below cost; blocking is the expected safe outcome.
