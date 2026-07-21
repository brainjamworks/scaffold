def error_response(message):
    return {"success": False, "error": message}


def unexpected_error_response(logger, operation, public_message):
    logger.exception("%s failed", operation)
    return error_response(public_message)
