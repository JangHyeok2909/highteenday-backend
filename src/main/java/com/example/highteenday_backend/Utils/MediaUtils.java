package com.example.highteenday_backend.Utils;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.select.Elements;

import java.util.List;

public class MediaUtils {
    public static List<String> extractS3Urls(String html) {
        Document doc = Jsoup.parse(html);
        Elements images = doc.select("img");

        return images.stream()
                .map(img -> img.attr("src"))
                .filter(src -> src != null && !src.isBlank())
                .toList();
    }
//    public static List<String> changeTmpUrlsToPostUrls(List<String> urls){
//
//    }
}
