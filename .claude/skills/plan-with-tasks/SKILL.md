---
name: plan-with-tasks
description: Plans in detail, and produces high quality task lists with proper structure.
---

You have been tasked with creating a plan. It should be well-researched, which means actually going into the codebase and performing the research necessary to make fully informed decisions about how changes should be done. Never assume - always do actual research.

Your plan should be divided into phases, each of which has multiple tasks. Each task should be a single, focused action item. Each of those will go on to be one task in the final task list.

When drafting your plan, there should be a step zero, which is as follows:

```
Before beginning with the plan, richly and granularly populate your task list. For each phase of the plan, there are multiple action items, and you should load each one in as a distinct task in your task list tool. Between each phase, create a set of the following three tasks: 1) a zero-violations claudecatcher run as a gate, 2) a hostile audit by running ``./claudecatcher --hostile-audit``, and 3) a commit step, where all work from the phase is committed to git before moving onto the next phase.

At the end of the task list, there should be a final set of tasks:

- Completion audit: is Phase 1 fully satisfied?
- Fix any issues identified in Phase 1 audit
- Completion audit: is Phase 2 fully satisfied? (this repeats once for every phase in the plan)
- Fix any issues identified in Phase 2 audit (this repeats once for every phase in the plan)
- Final overall post-fixes completion audit
- Inform the user of the findings of the final audit with a detailed breakdown of any unresolved test failures, claudecatcher violations, etc.

NOTE: The hostile audit tasks must run ``./claudecatcher --hostile-audit``. You must run it until it produces NO FINDINGS.

NOTE: The ClaudeCatcher gate tasks must explicitly state in their description that a gate may only be passed with zero violations at the error, warning AND info levels when ClaudeCatcher is run on the project root - folder scoping is not permitted for gates. Additionally, the description must explicitly state that if the agent thinks there is justification for not following these instructions exactly, it must immediately stop all work, explain to the user, and await their sign-off. Skipping or weakening requirements without explicit user approval will be punished by termination.
```

Copy this in as step zero, verbatim (with one exception), every time you ever formally present a plan. The exception is that you should modify it to include the proper number of repeated steps for the phases in your plan, as indicated.