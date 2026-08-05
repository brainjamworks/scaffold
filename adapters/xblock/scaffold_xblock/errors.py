def error_response(message):
    return {"success": False, "error": message}


def unexpected_error_response(
    logger,
    operation,
    public_message,
    *,
    include_exception=True,
):
    log_failure = logger.exception if include_exception else logger.error
    log_failure("%s failed", operation)
    return error_response(public_message)
