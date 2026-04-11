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
