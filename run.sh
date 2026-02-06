#!/bin/bash
cd "$(dirname "$0")"
ELECTRON_DISABLE_SANDBOX=1 npm run start
