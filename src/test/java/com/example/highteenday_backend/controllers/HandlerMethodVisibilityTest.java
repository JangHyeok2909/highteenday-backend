package com.example.highteenday_backend.controllers;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.Resource;
import org.springframework.core.type.classreading.CachingMetadataReaderFactory;
import org.springframework.core.type.classreading.MetadataReaderFactory;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 컨트롤러는 ExecutionLoggingAspect 의 within(controllers..*) 포인트컷 때문에 CGLIB 프록시로 감싸진다.
 * 이때 핸들러 메서드가 private 이면 프록시가 target 으로 위임하지 못하고 프록시 인스턴스에서 직접 실행되어
 * 주입된 필드가 모두 null 인 상태로 동작한다 (NPE → 500).
 */
class HandlerMethodVisibilityTest {

    @Test
    @DisplayName("모든 @RequestMapping 핸들러 메서드는 public 이어야 한다")
    void allHandlerMethodsArePublic() throws Exception {
        List<String> violations = new ArrayList<>();

        for (Class<?> controller : findControllerClasses()) {
            for (Method method : controller.getDeclaredMethods()) {
                if (method.isAnnotationPresent(RequestMapping.class)
                        || hasMetaRequestMapping(method)) {
                    if (!Modifier.isPublic(method.getModifiers())) {
                        violations.add(controller.getSimpleName() + "#" + method.getName());
                    }
                }
            }
        }

        assertThat(violations).isEmpty();
    }

    private boolean hasMetaRequestMapping(Method method) {
        return java.util.Arrays.stream(method.getAnnotations())
                .anyMatch(a -> a.annotationType().isAnnotationPresent(RequestMapping.class));
    }

    private List<Class<?>> findControllerClasses() throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        MetadataReaderFactory factory = new CachingMetadataReaderFactory(resolver);
        Resource[] resources = resolver.getResources(
                "classpath*:com/example/highteenday_backend/controllers/**/*.class");

        List<Class<?>> classes = new ArrayList<>();
        for (Resource resource : resources) {
            String className = factory.getMetadataReader(resource).getClassMetadata().getClassName();
            if (className.contains("Test")) continue;
            classes.add(Class.forName(className));
        }
        return classes;
    }
}
