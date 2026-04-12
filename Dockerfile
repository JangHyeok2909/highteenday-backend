# ==============================
# HighteenDay Backend — Docker Usage
#
# Build image:
#   docker build -t highteenday-backend .
#
# Run container (inject all required environment variables):
#   docker run -p 8080:8080 \
#     -e DB_URL=jdbc:mysql://<host>:3306/highteenday_db \
#     -e DB_USERNAME=<db_username> \
#     -e DB_PASSWORD=<db_password> \
#     -e REDIS_HOST=<redis_host> \
#     -e JWT_KEY=<jwt_secret_key> \
#     -e S3_BUCKET=<s3_bucket_name> \
#     -e GOOGLE_CLIENT_ID=<google_oauth_client_id> \
#     -e GOOGLE_CLIENT_SECRET=<google_oauth_client_secret> \
#     -e NEIS_API_KEY=<neis_api_key> \
#     highteenday-backend
#
# Notes:
#   - The container runs with --spring.profiles.active=prod (application-prod.properties)
#   - All sensitive values must be passed as environment variables (never hardcode them)
#   - Default port is 8080; change host port mapping (-p <host_port>:8080) if needed
# ==============================

# ==============================
# Build stage
# ==============================
FROM eclipse-temurin:17-jdk-jammy AS builder

WORKDIR /app

COPY gradlew .
COPY gradle gradle
COPY build.gradle .
COPY settings.gradle .
COPY src src
COPY schoolData schoolData

RUN chmod +x gradlew && ./gradlew build -x test --no-daemon

# ==============================
# Runtime stage
# ==============================
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Run as non-root user for security
RUN addgroup --system spring && adduser --system --ingroup spring spring
USER spring

COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar", "--spring.profiles.active=prod"]
