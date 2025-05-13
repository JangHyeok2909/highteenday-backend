package com.example.highteenday_backend;


import com.example.highteenday_backend.Utils.MediaUtils;
import com.example.highteenday_backend.dtos.PostRequestDto;
import com.example.highteenday_backend.services.domain.MediaService;
import com.example.highteenday_backend.services.domain.PostService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.assertj.core.api.Assertions;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;


@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
public class PostMediaFlowTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private PostService postService;
    @Autowired
    private MediaService mediaService;


    @Test
    void uploadImgAndCreatePostFlowTest() throws Exception {
        List<String> urls  = new ArrayList<>();
        List<Resource> resources = new ArrayList<>();
        MvcResult mvcResult;
        ObjectMapper mapper = new ObjectMapper();
        resources.add(new ClassPathResource("static/testImg.png"));
        resources.add(new ClassPathResource("static/testImg2.jpeg"));
        resources.add(new ClassPathResource("static/testImg3.jpeg"));

        //s3 upload and media create
        for (Resource rs : resources){
            String filename = rs.getFilename();
            String mediaType;
            if(filename.contains("png")) mediaType = MediaType.IMAGE_PNG_VALUE;
            else  mediaType = MediaType.IMAGE_JPEG_VALUE;

            MockMultipartFile file = new MockMultipartFile(
                    "file",
                    rs.getFilename(),
                    MediaType.IMAGE_PNG_VALUE,
                    rs.getInputStream()
            );
            mvcResult = mockMvc.perform(multipart("/api/media")
                            .file(file))
                    .andExpect(status().isCreated())
                    .andExpect(header().string("Location",Matchers.containsString("amazonaws.com")))
                    .andReturn();

            String url = mvcResult.getResponse().getHeader("Location");
            urls.add(url);
        }


        //post create and link media
        String htmlContent = """
            <div>반갑습니다.
            <img src="%s"/>
            <div>첫번째 사진입니다.</div>
            <img src="%s"/>
            <div>두번째 사진입니다.</div>
            <img src="%s"/>
            <div>세번째 사진입니다.</div>
            """.formatted(urls.get(0), urls.get(1), urls.get(2));

        PostRequestDto postRequestDto = PostRequestDto.builder()
                .userId(1l)
                .boardId(1l)
                .title("안녕하세요.")
                .content(htmlContent)
                .isAnonymous(true)
                .build();

        mvcResult = mockMvc.perform(post("/api/posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(postRequestDto)))
                .andExpect(status().isCreated())
                .andReturn();

        String location = mvcResult.getResponse().getHeader("Location");

        //get created post
        mvcResult = mockMvc.perform(get(location))
                .andExpect(status().isOk())
                .andReturn();

        //json으로 전달받은 html형식의 content에서 url 파싱, 파싱한 url 과 s3url 동일한지 검사
        String contentAsString = mvcResult.getResponse().getContentAsString();
        Map<String,Object> map = mapper.readValue(contentAsString, new TypeReference<>() {});
        List<String> parsedUrls = MediaUtils.extractS3Urls((String) map.get("content"));

        assertThat(parsedUrls).hasSize(urls.size());
        for(int i=0;i<urls.size();i++) assertThat(parsedUrls.get(i)).isEqualTo(urls.get(i));


    }

}
