# Error Codes Reference

This document provides a reference for all error codes used in the Agentic OS V3.

## General Errors

- `400`: Bad Request - The server could not understand the request.
- `401`: Unauthorized - Authentication is required and has failed or has not yet been provided.
- `403`: Forbidden - The server understood the request but refuses to authorize it.
- `404`: Not Found - The requested resource could not be found.
- `500`: Internal Server Error - The server encountered an unexpected condition.

## Agent-Specific Errors

- `1001`: Agent Not Found - The specified agent could not be found.
- `1002`: Agent Initialization Failed - The agent failed to initialize.
- `1003`: Agent Execution Failed - The agent failed during execution.

## Task-Specific Errors

- `2001`: Task Not Found - The specified task could not be found.
- `2002`: Task Validation Failed - The task failed validation.
- `2003`: Task Execution Failed - The task failed during execution.
