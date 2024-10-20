import time
from selenium import webdriver
from selenium.webdriver.chrome.service import ChromeService
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
from lxml import etree

def fetch_blog_posts(url):
    driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()))
    driver.get(url)
    
    time.sleep(5)  # Wait for initial posts to load

    last_height = driver.execute_script("return document.body.scrollHeight")
    while True:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(5)  # Increased wait time for dynamic content loading
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height

    soup = BeautifulSoup(driver.page_source, 'html.parser')
    posts = []

    for link in soup.select('article a[href]'):  # Ensure this selector targets your articles' links correctly
        post_url = link['href']
        if post_url not in posts:
            posts.append(post_url)
    
    driver.quit()
    return posts

def create_rss_feed(posts, feed_file):
    rss = etree.Element('rss', version='2.0', nsmap={'content': "http://purl.org/rss/1.0/modules/content/"})
    channel = etree.SubElement(rss, 'channel')
    etree.SubElement(channel, 'title').text = "Haripriya's Blog"
    etree.SubElement(channel, 'link').text = "https://www.haripriya.org/blog"
    etree.SubElement(channel, 'description').text = "A personal blog by Haripriya"
    etree.SubElement(channel, 'language').text = "en-us"

    for post in posts:
        item = etree.SubElement(channel, 'item')
        etree.SubElement(item, 'title').text = post['title']
        etree.SubElement(item, 'link').text = post['link']
        etree.SubElement(item, 'description').text = post['description']
        etree.SubElement(item, 'pubDate').text = post['pub_date']
        etree.SubElement(item, 'author').text = "Haripriya"
        content_encoded = etree.SubElement(item, '{http://purl.org/rss/1.0/modules/content/}encoded')
        content_encoded.text = etree.CDATA(post['content'])

    tree = etree.ElementTree(rss)
    tree.write(feed_file, encoding='utf-8', xml_declaration=True, pretty_print=True)

blog_url = 'https://www.haripriya.org/blog'
posts_data = fetch_blog_posts(blog_url)
create_rss_feed(posts_data, 'rss-feed.xml')
print("RSS feed generated successfully as rss-feed.xml")
