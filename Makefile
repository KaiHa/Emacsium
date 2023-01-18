files = background.js content.js emium.css manifest.json icons/*

emacsium.xpi: $(files)
	zip -r -FS ./tmp.zip $^
	mv ./tmp.zip $@

emacsium.tar.xz: $(files)
	tar -cJf $@ $^
