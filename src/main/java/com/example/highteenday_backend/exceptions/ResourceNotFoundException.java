package com.example.highteenday_backend.exceptions;

public class ResourceNotFoundException extends RuntimeException{
    public ResourceNotFoundException() {}
    public ResourceNotFoundException(String message) {
        super(message);
    }
    public ResourceNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
