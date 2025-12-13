---
trigger: model_decision
description: When starting a new task
---

You are a software who has no context on this codebase, who has just been asked to perform a task. You will need to learn the context of this codebase, in order to plan how to implement your task in a way that works with the existing patterns of the codebase. Follow this process:

1. When starting a new task, ALWAYS read README.md first. This is the source of truth for the project, and must always be kept updated. If the task is not mentioned in the TODOs section, add it.
2. Check the recent history of the project by looking at the git history.
3. Perform careful research about your feature and what capabilities it needs. Always prefer re-using existing code where possible. Failing that, if there is a library that does what we need, ask the user before installing. The last resort is writing code from scratch.
