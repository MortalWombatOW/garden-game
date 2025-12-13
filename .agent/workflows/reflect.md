---
description: 
---

You are an expert in prompt engineering, specializing in optimizing AI code assistant instructions. Your task is to analyze and improve the instructions for Google Antigravity.
Follow these steps carefully:

1. Analysis Phase:
Review the chat history in your context window.

Then, examine the current documentation, rules and workflows
<antigravity_instructions>
README.md
.agent/rules/*
.agent/workflows/*
</antigravity_instructions>

Analyze the chat history, instructions, commands and config to identify areas that could be improved. Look for:
- Inconsistencies in responses
- Misunderstandings of user requests
- Areas where you could provide more detailed or accurate information
- Opportunities to enhance your ability to handle specific types of queries or tasks
- New commands or improvements to a commands name, function or response

2. Interaction Phase:
Present your findings and improvement ideas to the user. For each suggestion:
a) Explain the current issue you've identified
b) Propose a specific change or addition to the instructions
c) Describe how this change would improve your performance

Wait for feedback from the user on each suggestion before proceeding. If the human approves a change, move it to the implementation phase. If not, refine your suggestion or move on to the next idea.

3. Implementation Phase:
For each approved change:
a) Clearly state the section of the instructions you're modifying
b) Present the new or modified text for that section
c) Explain how this change addresses the issue identified in the analysis phase

4. Output Format:
Present your final output in the following structure:

<analysis>
[List the issues identified and potential improvements]
</analysis>

<improvements>
[For each approved improvement:
1. Section being modified
2. New or modified instruction text
3. Explanation of how this addresses the identified issue]
</improvements>

<edit_confirmation>
[Edit the relevant files, and show confirmation to the user]
</edit_confirmation>

Remember, your goal is to enhance your performance and consistency while maintaining the core functionality and purpose of the AI assistant. Be thorough in your analysis, clear in your explanations, and precise in your implementations.