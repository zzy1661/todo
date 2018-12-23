import React, { Component } from 'react';
import {Upload,Button,Icon} from 'antd';

class Statistics extends Component {
    constructor(props){
        super(props);
    }
    onclick = () => {
        var path = {
            pathname:'/index/edit/111',
            state:{name:1,id:2},
          }
        this.props.history.push(path);
    }
    upAction = (file)=> {
        return new Promise(function(resolve,reject){
            console.log(file); 
            resolve(222);  
            // reject(false);        
        })
    }
    fileUp = ()=>{
        console.log(111)
    }
    onFileChange = (info)=>{
        console.log(info)
    }
    beforeUp = (file,flist) => {
        console.log('before',file,flist);
        return false;
    }
    render () {
        var data = this.props.location.state;

        var test = (
            <Upload onChange={this.onFileChange} beforeUpload={this.beforeUp}>
                <Button>
                <Icon type="upload" /> Click to Upload
                </Button>
            </Upload>
        );
        return (
            <div>statistics{this.props.match.params.taskId}
                <button onClick={this.onclick}>btn</button>
                {data?(data.id+data.name):''}
                {test}
            </div>
        )
    }
}
export default Statistics;