import Image from '../image';
import array from 'new-array';

import copy from '../utility/copy';

export default function pad({
    size = 0,
    algorithm = 'replicate'
    } = {}) {

    this.checkProcessable('pad', {
        bitDepth: [8, 16],
        dimension: 2
    });

    let fillColor=array(this.channels, null);
    if (Array.isArray(algorithm)) {
        if (algorithm.length!==this.channels) {
            throw new Error('pad: the algorithm specified as an array must have the same length as the number of channels. Here: '+this.channels);
        }
        fillColor=algorithm;
        for (let i=0; i<fillColor.length; i++) {
            if (fillColor[i]===0) fillColor[i]=0.001;
        }
    }

    if (! Array.isArray(size)) {
        size=[size,size];
    }

    let newWidth = this.width+size[0]*2;
    let newHeight = this.height+size[1]*2;
    let channels = this.channels;

    let newImage = Image.createFrom(this, {width: newWidth, height: newHeight});

    copy(this, newImage, size[0], size[1]);



    for (let i=size[0]; i<newWidth-size[0]; i++) {
        for (let k=0; k<channels; k++) {
            let value=fillColor[k] || newImage.data[(size[1]*newWidth+i)*channels+k];
            for (let j=0; j<size[1]; j++) {
                newImage.data[(j*newWidth+i)*channels+k]=value;
            }
            value=fillColor[k] || newImage.data[((newHeight-size[1]-1)*newWidth+i)*channels+k];
            for (let j = newHeight - size[1]; j < newHeight; j++) {
                newImage.data[(j*newWidth+i)*channels+k]=value;
            }
        }
    }

    for (let j=0; j<newHeight; j++) {
        for (let k=0; k<channels; k++) {
            let value=fillColor[k] || newImage.data[(j*newWidth+size[0])*channels+k];
            for (let i=0; i<size[0]; i++) {
                newImage.data[(j*newWidth+i)*channels+k]=value;
            }
            value=fillColor[k] || newImage.data[(j*newWidth+newWidth-size[0]-1)*channels+k];
            for (let i = newWidth - size[0]; i < newWidth; i++) {
                newImage.data[(j*newWidth+i)*channels+k]=value;
            }
        }
    }

    return newImage;
}