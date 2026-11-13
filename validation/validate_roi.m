function out = validate_roi(filename)
% Independently compute using MATLAB fft2. Input: exported grayscale ROI PNG.
I=imread(filename); if ndims(I)==3, I=I(:,:,1); end
v=double(I)/255; n=size(v,1); assert(size(v,2)==n);
w=0.5-0.5*cos(2*pi*(0:n-1)'/(n-1));
P=abs(fft2((v-mean(v(:))).*(w*w'))).^2;
k=min(0:n-1,n-(0:n-1)); [X,Y]=meshgrid(k,k); bins=floor(hypot(X,Y));
f=(2:n/2-1)'/n; power=arrayfun(@(r)mean(P(bins==r)),(2:n/2-1)');
use=f>=4/n & f<=.25 & power>0;
[out.psd_fit,out.psd_r2]=fitline(log10(f(use)),log10(power(use)));
out.beta=-out.psd_fit(1); out.psd=table(f,power,use);
sizes=(2.^(1:log2(n/4)))'; counts=zeros(size(sizes));
for j=1:numel(sizes)
 s=sizes(j); total=0;
 for y=1:s:n
  for x=1:s:n
   block=v(y:y+s-1,x:x+s-1); total=total+floor(max(block(:))/(s/n))-floor(min(block(:))/(s/n))+1;
  end
 end
 counts(j)=total;
end
[out.dbc_fit,out.dbc_r2]=fitline(log10(n./sizes),log10(counts));
out.D=out.dbc_fit(1);out.dbc=table(sizes,counts);disp(out)
end
function [p,r2]=fitline(x,y)
if numel(x)<2,p=[NaN NaN];r2=NaN;return;end
p=polyfit(x,y,1);ss=sum((y-mean(y)).^2);if ss==0,r2=NaN;else,r2=1-sum((y-polyval(p,x)).^2)/ss;end
end
