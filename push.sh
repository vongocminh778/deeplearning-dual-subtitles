#!/bin/bash
# Sau khi tạo repo trên GitHub, chạy các lệnh này:

cd /home/minhvo/Downloads/coursera-dual-subtitles-master

# Xóa remote cũ nếu có
git remote remove origin 2>/dev/null

# Thêm remote mới
git remote add origin https://github.com/vongocminh778/deeplearning-dual-subtitles.git

# Push lên GitHub
git push -u origin main
