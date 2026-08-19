#!/usr/bin/env python3
"""Run this to see what params LeagueDashPlayerStats actually accepts."""
import inspect
from nba_api.stats.endpoints import leaguedashplayerstats
sig = inspect.signature(leaguedashplayerstats.LeagueDashPlayerStats.__init__)
print("=== LeagueDashPlayerStats parameters ===")
for name, param in sig.parameters.items():
    if name == 'self': continue
    print(f"  {name} = {param.default!r}")